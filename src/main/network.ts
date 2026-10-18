import { execFileSync } from 'node:child_process';
import { setGlobalProxyFromEnv } from 'node:http';

/** Use the user's existing manual Windows proxy when no environment route was
 * supplied. Never change system settings or print proxy credentials. PAC-only
 * configurations remain with the system; this Node transport does not run PAC. */
export function configureNetwork() {
  if (process.platform === 'win32' && !['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY'].some(name => process.env[name])) {
    try {
      const settings = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
        { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
          env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH } });
      if (/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(settings)) {
        const server = settings.match(/\bProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1].trim();
        if (server) {
          const routes = Object.fromEntries(server.split(';').map(value => value.trim().split('=')));
          for (const protocol of ['http', 'https']) {
            const address = server.includes('=') ? routes[protocol] : server;
            if (!address) continue;
            const url = new URL(address.includes('://') ? address : 'http://' + address);
            if (['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash)
              process.env[protocol.toUpperCase() + '_PROXY'] = url.href;
          }
          if (!process.env.no_proxy && !process.env.NO_PROXY) {
            const bypass = settings.match(/\bProxyOverride\s+REG_SZ\s+([^\r\n]+)/i)?.[1] || '';
            process.env.NO_PROXY = ['localhost', '127.0.0.1', '::1', ...bypass.split(';').map(value => value.trim()).filter(value => value && value !== '<local>')].join(',');
          }
        }
      }
    } catch { /* An unavailable manual proxy setting does not disable direct access. */ }
  }
  if (['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY'].some(name => process.env[name])) setGlobalProxyFromEnv();
}
