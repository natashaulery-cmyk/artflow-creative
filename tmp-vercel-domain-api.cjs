const fs=require('fs'); const https=require('https');
const token=JSON.parse(fs.readFileSync('/root/.local/share/com.vercel.cli/auth.json','utf8')).token;
const team='team_Da4vepEeO7Mr8UZvmYizxV53';
function call(method,path,body){return new Promise((resolve)=>{const data=body?JSON.stringify(body):''; const req=https.request({hostname:'api.vercel.com',path,method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{let out='';res.on('data',c=>out+=c);res.on('end',()=>resolve({status:res.statusCode,out}));});req.on('error',e=>resolve({status:0,out:e.message}));if(data)req.write(data);req.end();});}
(async()=>{
  for(const x of [
    ['POST',`/v4/domains?teamId=${team}`,{name:'artflowcreativeapp.com'}],
    ['GET',`/v6/domains/artflowcreativeapp.com/config?teamId=${team}`,null],
    ['GET',`/v9/projects/prj_DROTZuTXWIqP0aCXDtJ0xMkWAitz/domains?teamId=${team}`,null]
  ]){const r=await call(...x); console.log('\n'+x[0]+' '+x[1]+' -> '+r.status); try{console.log(JSON.stringify(JSON.parse(r.out),null,2));}catch{console.log(r.out.slice(0,5000));}}
})();
