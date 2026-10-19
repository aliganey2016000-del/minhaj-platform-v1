import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

const read=(relative)=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const admin=read('../src/features/admin/pages/courses-manage.tsx');
const student=read('../src/features/shared/pages/global-courses-page.tsx');
const backend=read('../../backend/src/controllers/course.controller.ts');
const routes=read('../../backend/src/routes/v1/course.routes.ts');
assert.match(admin,/Guulgaar book cover|Book Cover · Jaldiga Buugga/);
assert.match(admin,/accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(admin,/api\.post\('\/courses\/cover', body\)/);
assert.match(admin,/thumbnail\s*}/,'Cover must be bound into Course create and edit payload');
assert.match(student,/<GuulgaarBookCover cover=\{course\.thumbnail\}/);
assert.match(student,/object-contain/,'Do not crop portrait book jackets');
assert.match(backend,/isGuulgaarCoverUrl\(req\.body\.thumbnail\)/);
assert.match(backend,/scope === 'global' && req\.body\.thumbnail \? \{ thumbnail:/);
assert.match(routes,/router\.get\('\/cover\/:file'/);
assert.match(routes,/roleMiddleware\(\['admin'\]\)/,'Only Super Admin may upload global book covers');

const source=read('../../backend/src/controllers/guulgaar-course-cover.controller.ts');
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
}}).outputText;
const stored=new Map();
class BadRequestError extends Error {}
class NotFoundError extends Error {}
const scope={exports:{},process,Buffer,
  require(module){
    if(module==='crypto')return crypto;
    if(module==='fs')return fs;
    if(module==='path')return path;
    if(module==='../utils/api-error')return {BadRequestError,NotFoundError};
    if(module==='../utils/api-response')return {success:(_res,data)=>({data})};
    if(module==='../utils/upload-safety')return {UPLOADS_ROOT:'/tmp/test-covers'};
    if(module==='../utils/r2-storage')return {
      r2Enabled:true,
      uploadToR2:async (key,buffer,mime)=>stored.set(key,{buffer,mime}),
      getFromR2:async key=>{
        const row=stored.get(key);
        if(!row)throw Error('missing');
        return {body:row.buffer,contentType:row.mime};
      },
    };
    throw Error('Unexpected import '+module);
  },
};
vm.runInNewContext(js,scope);
const {uploadCourseCover,getCourseCover,isGuulgaarCoverUrl}=scope.exports;
const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0]);
const req={file:{mimetype:'image/png',buffer:image,size:image.length,originalname:'physics.png'}};
const response=await uploadCourseCover(req,{});
assert.match(response.data.url,/^\/api\/v1\/courses\/cover\/[a-f0-9]{32}\.png$/);
assert.equal(isGuulgaarCoverUrl(response.data.url),true);
assert.equal(isGuulgaarCoverUrl('javascript:alert(1)'),false);
assert.equal(stored.size,1);
const filename=response.data.url.split('/').pop();
const headers={},out={set:(name,value)=>{headers[name]=value;},send:(data)=>{out.body=data;}};
await getCourseCover({params:{file:filename}},out);
assert.equal(headers['Content-Type'],'image/png');
assert.ok(out.body.equals(image));
await assert.rejects(uploadCourseCover({file:{...req.file,mimetype:'image/svg+xml'}},{}),BadRequestError);
await assert.rejects(uploadCourseCover({file:{...req.file,buffer:Buffer.from('not-a-png')}},{}),BadRequestError);
await assert.rejects(uploadCourseCover({file:{...req.file,size:4*1024*1024}},{}),BadRequestError);
await assert.rejects(getCourseCover({params:{file:'../secret.png'}},out),NotFoundError);
console.log('PASS: super-admin-only cover contract, R2 upload/read, magic bytes, file limit and student card integration');
