import {fail} from './api.js';
// Work-list dates are independent of parents and deadlines. Browser day wins;
// Pacific/Auckland is the explicit fallback for requests without a local day.
export function stagingToday(value){
 if(value!=null)return taskDate(value);
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
export function taskDate(value,today){
 if(value==null||value==='')return today||stagingToday();
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value))fail(400,'Invalid task date');
 const day=value.slice(0,10),parsed=new Date(day+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day)fail(400,'Invalid task date');
 return value;
}
export function dateAllTasks(tasks,today){
 for(const task of tasks)if(!task.isSection)task.date=taskDate(task.date,today);
 return tasks;
}
