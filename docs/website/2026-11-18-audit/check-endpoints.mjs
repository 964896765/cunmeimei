// Read-only public DNS/HTTP checks. No credentials, remote login or configuration changes.
import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

const resolver = new Resolver({ timeout: 2500, tries: 1 });
const hosts = ['dgqfl.xyz', 'www.dgqfl.xyz', 'api.dgqfl.xyz', 'admin.dgqfl.xyz'];

function probe(url, method = 'HEAD') {
  return new Promise(resolve => {
    const started = Date.now();
    const client = url.startsWith('https:') ? https : http;
    const request = client.request(url, { method, timeout: 8000 }, response => {
      const certificate = response.socket.getPeerCertificate?.();
      const result = {
        url, method, status: response.statusCode,
        location: response.headers.location || null,
        tls: certificate ? {
          authorized: response.socket.authorized,
          subject: certificate.subject?.CN,
          issuer: certificate.issuer?.O,
          validFrom: certificate.valid_from,
          validTo: certificate.valid_to,
          subjectAltName: certificate.subjectaltname
        } : null,
        elapsedMs: Date.now() - started
      };
      // Only retain the small, public local health/ready response bodies.
      if (method === 'GET') {
        let body = '';
        response.on('data', chunk => { body = (body + chunk).slice(0, 1024); });
        response.on('end', () => resolve({ ...result, body }));
        response.on('error', error => resolve({ ...result, error: error.code || 'RESPONSE_ERROR' }));
      } else {
        response.resume();
        resolve(result);
      }
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })));
    request.on('error', error => resolve({ url, method, error: error.code || 'REQUEST_ERROR', elapsedMs: Date.now() - started }));
    request.end();
  });
}

const checkedAt = new Date().toISOString();
const records = await Promise.all(hosts.map(async host => ({
  host,
  records: await Promise.all(['A', 'AAAA', 'CNAME'].map(async type => {
    try { return { type, values: await resolver.resolve(host, type) }; }
    catch (error) { return { type, error: error.code || 'DNS_ERROR' }; }
  }))
})));
const publicRequests = await Promise.all(hosts.flatMap(host => [
  probe(`http://${host}/`), probe(`https://${host}/`)
]));
const localBaseline = await Promise.all([
  probe('http://127.0.0.1:3101/api/v1/health', 'GET'),
  probe('http://127.0.0.1:3101/api/v1/ready', 'GET')
]);
console.log(JSON.stringify({
  checkedAt,
  scope: 'Current workstation resolver and direct Node HTTP clients; no proxy, DNS changes or production login. DNS errors are observations from this environment, not a global availability verdict.',
  records, publicRequests, localBaseline
}, null, 2));
