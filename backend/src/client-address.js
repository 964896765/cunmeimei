'use strict';
const net=require('node:net');

// The TCP peer is authoritative unless an explicitly allowed reverse proxy
// supplies a single, validated X-Real-IP header. Never accept an arbitrary
// X-Forwarded-For chain from a browser or an untrusted network hop.
function canonicalIp(value){
 if(typeof value!=='string')return '';
 const candidate=value.trim();
 if(candidate.startsWith('::ffff:')&&net.isIP(candidate.slice(7))===4)return candidate.slice(7);
 return net.isIP(candidate)?candidate:'';
}
function parseTrustedProxyIps(value){
 if(value===undefined||value===null||value==='')return [];
 const entries=Array.isArray(value)?value:String(value).split(',');
 if(entries.length>16||entries.some(v=>typeof v!=='string'||!v.trim()))throw Error('TRUSTED_PROXY_IPS_INVALID');
 const ips=entries.map(canonicalIp);
 if(ips.some(ip=>!ip))throw Error('TRUSTED_PROXY_IPS_INVALID');
 return [...new Set(ips)];
}
function makeClientAddress(trusted=[]){
 const proxies=new Set(parseTrustedProxyIps(trusted));
 return function clientAddress(req){
  const peer=canonicalIp(req.socket?.remoteAddress)||'unknown';
  if(!proxies.has(peer))return peer;
  const header=req.headers['x-real-ip'];
  // A comma-separated value is not a valid Nginx X-Real-IP address. Refuse
  // malformed forwarding data rather than permitting arbitrary client keys.
  if(typeof header!=='string'||header.includes(','))return peer;
  return canonicalIp(header)||peer;
 };
}
module.exports={canonicalIp,parseTrustedProxyIps,makeClientAddress};
