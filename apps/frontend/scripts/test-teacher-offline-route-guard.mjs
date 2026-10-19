import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real TeacherLayout with controlled React hooks, avoiding a browser
// network request in offline PIN mode. The scenario is a cold cached launch.
const source=fs.readFileSync(new URL('../src/features/teacher/components/teacher-layout.tsx',import.meta.url),'utf8');
const script=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
}}).outputText;
const effects=[];
const calls=[];
const jsx=(type,props)=>({type,props:props||{}});
let route='/teacher/attendance',offlineOnly=true;
const mockReact={
  useState:initial=>[initial,()=>{}],
  useCallback:fn=>fn,
  useEffect:fn=>{effects.push(fn);},
};
const loginNavigation=[];
const context={exports:{},window:{location:{}},
  require(path){
    if(path==='react')return mockReact;
    if(path==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(path==='react-router-dom')return {
      Navigate:'Navigate',Outlet:'Outlet',
      useLocation:()=>({pathname:route}),useNavigate:()=>url=>loginNavigation.push(url),
    };
    if(path.endsWith('/axios'))return {get:async url=>{calls.push(url);return {data:{data:{items:[]}}};}};
    if(path.endsWith('/auth-context'))return {useAuth:()=>({
      user:{role:'teacher',offlineOnly,email:'teacher-a@balcad.com'},
      logout:()=>{},lockOfflineSession:()=>{},
    })};
    if(path.endsWith('/teacher-sidebar-access'))return {
      firstAllowedTeacherRoute:()=>'/teacher/attendance',
      isTeacherRouteAllowed:(path,rights)=>
        (path==='/teacher/attendance' && rights['teacher/attendance']!==false) ||
        (path==='/teacher/schedule' && rights['teacher/schedule']!==false),
    };
    if(path.endsWith('/teacher-offline-attendance'))return {
      offlineAttendanceOwner:()=> 'balcad.schoolapp.so:school-a:teacher-a:session-a',
      getOfflineTeacherSidebar:async()=>({'teacher/attendance':true,'teacher/schedule':true}),
      getOfflineTeachingSchedule:async()=>({schedules:[],periods:[]}),
      getOfflineAttendanceAccessWindow:()=>({from:Date.now()-3600000,to:Date.now()+86400000}),
      OFFLINE_RECONNECT_GRACE_MS:86400000,
    };
    if(path.endsWith('/teacher-sidebar'))return {TeacherSidebar:'TeacherSidebar'};
    if(path.endsWith('/dashboard-header'))return {DashboardHeader:'DashboardHeader'};
    throw Error('Unexpected dependency '+path);
  },
};
vm.runInNewContext(script,context);
const flatten=value=>{
  if(Array.isArray(value))return value.flatMap(flatten);
  if(!value||typeof value!=='object')return [];
  return [value,...flatten(value.props?.children)];
};
let tree=context.exports.TeacherLayout();
for(const effect of effects.splice(0))effect();
assert.equal(calls.length,0,'Offline PIN session must not fetch sidebar settings');
assert.ok(flatten(tree).some(n=>n.type==='Outlet'),'Offline attendance must mount cached attendance');
assert.ok(flatten(tree).some(n=>n.type==='TeacherSidebar'),'Offline portal must display teacher navigation');
route='/teacher/exams';
tree=context.exports.TeacherLayout();
for(const effect of effects.splice(0))effect();
assert.ok(flatten(tree).some(n=>n.type==='Navigate'&&n.props.to==='/teacher/attendance'),
  'PIN-only session must not open exams, gradebook, dashboard or other routes');
assert.equal(calls.length,0,'Offline account must never request teacher-wide API');
console.log('PASS: offline PIN bypasses failing sidebar access guard but blocks unrelated teacher routes');
