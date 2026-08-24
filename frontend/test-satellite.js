const sharp = require('sharp');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

const CA = `-----BEGIN CERTIFICATE-----
MIIEgjCCA2qgAwIBAgIKIXrVixxxPAAgkTANBgkqhkiG9w0BAQsFADBnMQswCQYD
VQQGEwJJTjETMBEGA1UECxMKZW1TaWduIFBLSTElMCMGA1UEChMcZU11ZGhyYSBU
ZWNobm9sb2dpZXMgTGltaXRlZDEcMBoGA1UEAxMTZW1TaWduIFJvb3QgQ0EgLSBH
MTAeFw0xODAyMTgxODMwMDBaFw0zMzAyMTgxODMwMDBaMGYxCzAJBgNVBAYTAklO
MRMwEQYDVQQLEwplbVNpZ24gUEtJMSUwIwYDVQQKExxlTXVkaHJhIFRlY2hub2xv
Z2llcyBMaW1pdGVkMRswGQYDVQQDExJlbVNpZ24gU1NMIENBIC0gRzEwggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCU1fhvfUV6OJOhMHAzBZDvxxpa5bvT
S1x6S4rVQmP/+125Wj2gpxvtII2RyqXQFlZd3qAKMLgqgHGzeJcyjw6CXbzJHmri
liVGWmuLn/NUKjKJgP9zd6eGOHe6mT1WjB9ZZEFLsDYoXBthTwcHdLWK2quJrHgS
3hZiJnpkX+hmaY7DX89oUMI1uvCQaPljgTvtiR9vtmeg/GgyePX8K5EUMozX8ElR
DMWkzdFUYv0DVcSQcbN1R/IDhWW1vPHzU8kexAMO4B/E5sj6FGrAeMM36/uZ3AmF
4mt/0Ia2BKPsW/K2T3hkaNSTr2BKlUm6bRccONcNAyzyN258xcUcX+RJAgMBAAGj
ggEvMIIBKzAfBgNVHSMEGDAWgBT77w2GnrDj3am58SEXfz788HcrGjAdBgNVHQ4E
FgQUNNH3OTJFQEqZK32JaldprZWv4zcwDgYDVR0PAQH/BAQDAgEGMB0GA1UdJQQW
MBQGCCsGAQUFBwMBBggrBgEFBQcDAjA9BgNVHSAENjA0MDIGBFUdIAAwKjAoBggr
BgEFBQcCARYcaHR0cDovL3JlcG9zaXRvcnkuZW1zaWduLmNvbTASBgNVHRMBAf8E
CDAGAQH/AgEAMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEFBQcwAYYWaHR0cDovL29j
c3AuZW1zaWduLmNvbTAzBgNVHR8ELDAqMCigJqAkhiJodHRwOi8vY3JsLmVtc2ln
bi5jb20/Um9vdENBRzEuY3JsMA0GCSqGSIb3DQEBCwUAA4IBAQAaBDZfBK+cP9Zk
lI7QN3mkpgD+mYfp/03P51cUNlfAFoYd1G/4lU468rg7JLTwqFXcDzcmrWt8lmdi
AMflxwLGeNObNS9RkpdiMDCdRItCHq00IMbbzj5rz+HSzAn6WsbLn9efn9WhO1MO
72d1SsEbVOTw/Z3sfPpWS8DSp91TRZuRKReVmD967QnsQGYNKUG6esTV73dOigHC
ndwglIXCUkaxTroFn7wT6Sqt9pklaqxBkEx/yzp0HxpZtC8uK6aOFx624S9yF8nk
6U7rbscn4kJYOF+0U9JshFkQ4+cx5kKd3cGNtmaTzemoZSGn+Aty6H6/oDPteLpE
cUPckzSa
-----END CERTIFICATE-----`;

const url = new URL('https://mausam.imd.gov.in/Satellite/Converted/IR1.gif');
https.get(url, {
  ca: [...tls.rootCertificates, CA],
  headers: { 'User-Agent': 'test' },
  timeout: 15000,
}, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', async () => {
    const buf = Buffer.concat(chunks);
    console.log('status:', res.statusCode, 'bytes:', buf.length, 'type:', res.headers['content-type']);
    try {
      const m = await sharp(buf, { animated: true, pages: -1 }).metadata();
      console.log('frames:', m.pages, 'width:', m.width, 'height:', m.height, 'pageHeight:', m.pageHeight);
      // Extract frame 0 as PNG to verify
      const f0 = await sharp(buf, { animated: false, page: 0 }).png().toBuffer();
      console.log('frame0 PNG bytes:', f0.length);
    } catch(e) { console.error('sharp error:', e.message); }
  });
}).on('error', (e) => console.error('fetch error:', e.message));
