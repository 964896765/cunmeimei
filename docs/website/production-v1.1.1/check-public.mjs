import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const ip = '8.156.72.144';
const domain = 'dgqfl.xyz';
const hosts = [domain, 'www.' + domain, 'api.' + domain];
const timeout = 5500;
const resolver = new Resolver({ timeout: 2500, tries: 1 });

async function lookup(client, host, type) {
  try { return { type, values: await client.resolve(host, type) }; }
  catch (error) { return { type, error: error.code }; }
}

async function records(client) {
  return Promise.all(hosts.map(async host => ({
    host,
    records: await Promise.all(['A', 'AAAA', 'CNAME'].map(type => lookup(client, host, type)))
  })));
}

function portStatus(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: ip, port, timeout });
    socket.on('connect', () => { resolve({ port, connected: true }); socket.destroy(); });
    socket.on('error', error => resolve({ port, connected: false, error: error.code }));
    socket.on('timeout', () => { resolve({ port, connected: false, error: 'TIMEOUT' }); socket.destroy(); });
  });
}

function peerTls(host) {
  return new Promise(resolve => {
    // Inspect public certificate metadata only, even if the peer chain is invalid.
    const socket = tls.connect({ host: ip, port: 443, servername: host, rejectUnauthorized: false });
    socket.setTimeout(timeout);
    socket.on('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      resolve({
        host, authorized: socket.authorized, certificateError: socket.authorizationError || null,
        protocol: socket.getProtocol(), subject: cert?.subject?.CN, altNames: cert?.subjectaltname,
        issuer: cert?.issuer?.CN, validFrom: cert?.valid_from, validTo: cert?.valid_to
      });
      socket.end();
    });
    socket.on('error', error => resolve({ host, error: error.code }));
    socket.on('timeout', () => { resolve({ host, error: 'TIMEOUT' }); socket.destroy(); });
  });
}

function head(url, address) {
  return new Promise(resolve => {
    const parsed = new URL(url);
    const options = {
      method: url.includes('/api/v1/') ? 'GET' : 'HEAD',
      headers: { Host: parsed.host },
      timeout,
      ...(address ? { hostname: address, servername: parsed.hostname } : {})
    };
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.request(parsed, options, response => {
      response.resume();
      resolve({
        url, ...(address ? { address } : {}), status: response.statusCode,
        location: response.headers.location || null, server: response.headers.server || null
      });
    });
    request.on('error', error => resolve({ url, ...(address ? { address } : {}), error: error.code }));
    request.on('timeout', () => request.destroy(Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })));
    request.end();
  });
}

const nameservers = await lookup(resolver, domain, 'NS');
const authoritative = (nameservers.values || []).map(async name => {
  const address = await lookup(resolver, name, 'A');
  if (!address.values?.length) return { name, address };
  const client = new Resolver({ timeout: 2200, tries: 1 });
  client.setServers([address.values[0]]);
  return { name, server: address.values[0], records: await records(client) };
});
const paths = hosts.map(host => host.startsWith('api.') ? '/api/v1/health' : '/');
const checkedAt = new Date().toISOString();
const report = {
  checkedAt, expectedEcsAddress: ip, nameservers,
  checks: Object.fromEntries(await Promise.all([
    ['resolverRecords', records(resolver)],
    ['authorityRecords', Promise.all(authoritative)],
    ['ecsPorts', Promise.all([80, 443].map(portStatus))],
    ['ecsTls', Promise.all(hosts.map(peerTls))],
    ['publicHttp', Promise.all(hosts.flatMap((host, i) =>
      ['http:', 'https:'].map(protocol => head(protocol + '//' + host + paths[i]))))],
    ['ecsHttp', Promise.all(hosts.flatMap((host, i) =>
      ['http:', 'https:'].map(protocol => head(protocol + '//' + host + paths[i], ip))))],
    ['localApi', Promise.all(['health', 'ready'].map(path => head('http://127.0.0.1:3101/api/v1/' + path)))]
  ].map(async ([name, pending]) => [name, await pending])))
};
console.log(JSON.stringify(report, null, 2));
