'use strict';
const object=d=>d&&typeof d==='object'&&!Array.isArray(d);
const valid=d=>object(d)&&['used','housing','service','community'].includes(d.kind)&&typeof d.clientKey==='string'&&!!d.clientKey;
const owner=()=>wx.getStorageSync('city_life_user_id')||'guest';
const key=uid=>'city_life_drafts_'+uid,legacyKey=uid=>'city_life_draft_'+uid;
const clone=d=>JSON.parse(JSON.stringify(d));
function hash(value){let h=2166136261;for(const c of JSON.stringify(value)){h=Math.imul(h^c.charCodeAt(0),16777619);}return (h>>>0).toString(36);}
function identify(raw,slot){return object(raw)&&typeof raw.clientKey==='string'&&raw.clientKey?raw.clientKey:'legacy_draft_'+hash(raw)+'_'+slot;}
function records(uid){
 const saved=wx.getStorageSync(key(uid));
 const rows=Array.isArray(saved)?saved.map((raw,index)=>({raw,index,slot:'item'+index})):saved?[{raw:saved,index:null,slot:'collection'}]:[];
 const legacy=wx.getStorageSync(legacyKey(uid));
 if(legacy!==''&&legacy!==undefined&&legacy!==null&&legacy!==false){const id=identify(legacy,'single');if(!rows.some(x=>identify(x.raw,x.slot)===id))rows.push({raw:legacy,index:null,slot:'single'});}
 return rows;
}
function normalize(record){
 const raw=record.raw,d=object(raw)?clone(raw):{},kind=d.kind||d.type;
 const photos=(Array.isArray(d.photos)?d.photos:Array.isArray(d.imageIds)?d.imageIds:[]).map(x=>typeof x==='string'?{id:x,path:''}:object(x)?clone(x):null).filter(Boolean);
 return {...d,kind,clientKey:identify(raw,record.slot),title:typeof d.title==='string'?d.title:'',detail:typeof d.detail==='string'?d.detail:typeof d.content==='string'?d.content:'',price:d.price==null?'':String(d.price),district:typeof d.district==='string'?d.district:'',attributes:object(d.attributes)?d.attributes:{},photos,savedAt:Number(d.savedAt)||0,draftRevision:Number(d.draftRevision)||0,_recordToken:hash(raw),_recoverable:['used','housing','service','community'].includes(kind)};
}
function list(uid=owner()){return records(uid).map(normalize).sort((a,b)=>b.savedAt-a.savedAt);}
function assertOwner(uid){if(uid!==owner())throw Error('账号已切换，请重新打开草稿');}
function collection(uid){const saved=wx.getStorageSync(key(uid));return Array.isArray(saved)?clone(saved):saved?[clone(saved)]:[];}
function save(uid,draft,expectedRevision=null,expectedToken){
 assertOwner(uid);if(!valid(draft))throw Error('草稿内容无效');
 const rows=records(uid),record=rows.find(x=>identify(x.raw,x.slot)===draft.clientKey),current=record&&normalize(record);
 if(current?(current.draftRevision!==expectedRevision||(expectedToken&&expectedToken!==current._recordToken)):expectedRevision!==null)throw Error('本机草稿已发生变化，请退出后重新读取，当前修改尚未保存');
 const clean=clone(draft);delete clean._recordToken;delete clean._recoverable;
 const saved={...(object(record?.raw)?clone(record.raw):{}),...clean,draftRevision:(current?.draftRevision||0)+1,savedAt:Date.now()},items=collection(uid);
 if(record&&record.slot!=='single')items[record.index??0]=saved;else items.unshift(saved);
 wx.setStorageSync(key(uid),items);
 // The original single-slot record stays intact if writing the collection fails.
 if(record?.slot==='single'){try{wx.removeStorageSync(legacyKey(uid));}catch{/* The collection takes precedence by clientKey; the old bytes remain safe. */}}
 return clone(saved);
}
function remove(uid,id,expectedRevision,expectedToken){
 assertOwner(uid);const rows=records(uid),record=rows.find(x=>identify(x.raw,x.slot)===id);if(!record)return false;
 const current=normalize(record);if(expectedRevision!==undefined&&current.draftRevision!==expectedRevision||expectedToken&&expectedToken!==current._recordToken)return false;
 const items=collection(uid);if(record.slot!=='single')items.splice(record.index??0,1);
 wx.setStorageSync(key(uid),items);
 const legacy=wx.getStorageSync(legacyKey(uid));if(legacy&&identify(legacy,'single')===id)wx.removeStorageSync(legacyKey(uid));return true;
}
module.exports={list,save,remove,valid};
