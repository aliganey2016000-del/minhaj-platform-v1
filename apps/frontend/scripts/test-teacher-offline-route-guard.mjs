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
const states=[];
let stateCursor=0;
const jsx=(type,props)=>({type,props:props||{}});
let route='/teacher/attendance',offlineOnly=true;
const mockReact={
  useState:initial=>{
    const index=stateCursor++;
    if(!(index in states))states[index]=initial;
    return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];
  },
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
      isTeacherRouteAllowed:(path,rights)=>{
        if(path==='/teacher/attendance')return rights['teacher/attendance']!==false;
        if(path==='/teacher/schedule')return rights['teacher/schedule']!==false;
        if(path==='/teacher/exams'||/^\\/teacher\\/exams\\/periods\\/[^/]+\\/?$/.test(path))
          return rights['group:teacher-exams']!==false&&rights['teacher/exams']!==false;
        if(path==='/teacher/exam-attendance'||/^\\/teacher\\/exam-attendance\\/[^/]+\\/?$/.test(path))
          return rights['group:teacher-exams']!==false&&rights['teacher/exam-attendance']!==false;
        if(/^\\/teacher\\/exams\\/[^/]+\\/attendance\\/?$/.test(path))
          return rights['group:teacher-exams']!==false&&rights['teacher/exam-attendance']!==false;
        return false;
      },
    };
    if(path.endsWith('/teacher-offline-attendance'))return {
      offlineAttendanceOwner:()=> 'balcad.schoolapp.so:school-a:teacher-a:session-a',
      getOfflineTeacherSidebar:async()=>({
        'teacher/attendance':true,'teacher/schedule':true,
        'group:teacher-exams':true,'teacher/exams':true,'teacher/exam-attendance':true,
        'teacher/exam-papers':true,'teacher/exam-incidents':true,
      }),
      getOfflineTeachingSchedule:async()=>({schedules:[],periods:[]}),
    };
    if(path.endsWith('/teacher-offline-exams'))return {
      getCachedTeacherExamPeriods:async()=>({periods:[{_id:'period-a',status:'published'}]}),
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
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
async function renderSettled(){
  stateCursor=0;effects.length=0;
  let tree=context.exports.TeacherLayout();
  for(const effect of effects.splice(0))effect();
  await wait();
  stateCursor=0;
  tree=context.exports.TeacherLayout();
  return tree;
}
let tree=await renderSettled();
assert.equal(calls.length,0,'Offline PIN session must not fetch sidebar settings');
assert.ok(flatten(tree).some(n=>n.type==='Outlet'),'Offline attendance must mount cached attendance');
assert.ok(flatten(tree).some(n=>n.type==='TeacherSidebar'),'Offline portal must display teacher navigation');
route='/teacher/exams';
tree=await renderSettled();
assert.ok(flatten(tree).some(n=>n.type==='Outlet'),'Prepared exam workspace must open with offline PIN and cached permissions');
route='/teacher/exams/exam-a/paper';
tree=await renderSettled();
assert.ok(flatten(tree).some(n=>n.type==='Navigate'&&n.props.to==='/teacher/attendance'),
  'Confidential exam papers must remain blocked in offline PIN mode');
assert.equal(calls.length,0,'Offline account must never request teacher-wide API');
console.log('PASS: offline PIN permits prepared exam workspace with cached rights, blocks confidential papers and makes no API calls');
