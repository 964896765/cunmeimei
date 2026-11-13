'use strict';

function blocks(body) {
 return String(body || '').split(/\r?\n/).map((line,index) => {
  const text=line.trim();
  if(!text || text==='---')return null;
  const heading=text.match(/^(#{1,3})\s+(.+)$/);
  const bullet=text.match(/^[-*]\s+(.+)$/);
  return {
   id:index,
   kind:heading?'heading-'+heading[1].length:bullet?'bullet':'paragraph',
   text:(heading?heading[2]:bullet?bullet[1]:text).replace(/\*\*(.*?)\*\*/g,'$1')
  };
 }).filter(Boolean);
}

module.exports={blocks};
