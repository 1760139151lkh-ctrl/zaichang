import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TIYI_MODULES,
  TIYI_SOURCE_ID,
  type TiyiConnectorState,
  type TiyiObservation,
  type TiyiReadArgs,
} from '../shared/tiyi';
import {
  TiyiTransportError,
  type TiyiHttpTransport,
  type TiyiHttpRequest,
} from './integrations/tiyi-transport';

interface TiyiRuntimeOptions {
  python?: string;
  connectorPath?: string;
  /** Migration inputs are host settings, never model parameters. */
  legacyDirectory?: string;
  signerDirectory?: string;
  signerDependencies?: string;
  /** Product-owned school session. Never a model argument or browser cookie. */
  transport?: TiyiHttpTransport;
  /** Captured once per attempt; host chooses direct versus WebVPN explicitly. */
  getTransport?: () => TiyiHttpTransport | undefined;
  /** Exercise submission is a host-owned switch, never a model tool argument. */
  allowSportSubmit?: boolean;
  sportEncoder?: 'plain' | 'aes';
}

const resources = new Set<string>([
  ...TIYI_MODULES.map((item) => item.resource),
  'profile',
  'menus',
  'terms',
  'summary',
  'records',
  'record_detail',
  'statistics',
  'rules',
  'course_terms',
  'courses',
  'attendance',
  'sport_rules',
  'sports_id',
  'prejudgment',
  'savesports',
]);

/** Owns the narrow school connection. No model-controlled URL, account or shell. */
export class TiyiAdapter {
  constructor(
    private privateDirectory: string,
    private options: TiyiRuntimeOptions = {},
  ) {
    this.privateDirectory = path.resolve(privateDirectory);
  }

  private connectorPath(): string {
    if (this.options.connectorPath) return path.resolve(this.options.connectorPath);
    const roots = [
      path.join(path.dirname(process.execPath), 'resources', 'tiyi-runtime', 'connector.py'),
      path.join(process.cwd(), 'src', 'main', 'integrations', 'tiyi_connector.py'),
      path.join(process.cwd(), 'dist-electron', 'tiyi-runtime', 'connector.py'),
    ];
    return roots.find((file) => existsSync(file)) ?? roots[0];
  }

  private runtimeAvailable(): boolean {
    const helper = this.connectorPath();
    return (
      existsSync(helper) &&
      (!['connector.py', 'tiyi_connector.py'].includes(path.basename(helper)) ||
        ['__init__.py', 'common.py', 'study.py', 'fitness.py', 'community.py'].every((file) =>
          existsSync(path.join(path.dirname(helper), 'tiyi_modules', file)),
        ))
    );
  }

  private hostSettings(): Pick<
    TiyiRuntimeOptions,
    'legacyDirectory' | 'signerDirectory' | 'signerDependencies' | 'allowSportSubmit' | 'sportEncoder'
  > {
    const local = path.join(this.privateDirectory, 'connector.json');
    const fallback = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Zaichang', 'tiyi', 'connector.json')
      : undefined;
    // An existing local config owns the whole choice, including an intentional
    // removal; never revive a missing field from an older fallback file.
    const file = existsSync(local) ? local : fallback;
    let saved: Record<string, unknown> = {};
    try {
      if (file && existsSync(file)) saved = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* A broken local choice does not activate an older config. */
    }
    const field = (
      name: 'legacyDirectory' | 'signerDirectory' | 'signerDependencies',
      environment?: string,
    ) => {
      const value = this.options[name] ?? (environment ? process.env[environment] : undefined) ?? saved[name];
      return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\r\n\0]/.test(value)
        ? value
        : undefined;
    };
    return {
      legacyDirectory: field('legacyDirectory'),
      signerDirectory: field('signerDirectory', 'ZAICHANG_TIYI_SIGNER_DIRECTORY'),
      signerDependencies: field('signerDependencies', 'ZAICHANG_TIYI_SIGNER_DEPENDENCIES'),
      allowSportSubmit: this.options.allowSportSubmit === true || saved.allowSportSubmit === true,
      sportEncoder:
        this.options.sportEncoder ??
        (saved.sportEncoder === 'aes' ? 'aes' : saved.sportEncoder === 'plain' ? 'plain' : undefined),
    };
  }

  describe(): TiyiConnectorState {
    const base = process.env.LOCALAPPDATA;
    const credentialsConfigured =
      !!base && existsSync(path.join(base, 'CodexZjuStudentInfo', 'credentials.dpapi'));
    const settings = this.hostSettings();
    const legacyDirectory =
      settings.legacyDirectory ?? (base ? path.join(base, 'local.zju.sports.desktop') : '');
    const sessionSaved =
      existsSync(path.join(this.privateDirectory, 'session.dpapi')) ||
      (!!legacyDirectory && existsSync(path.join(legacyDirectory, 'app-session.dpapi')));
    const runtimeAvailable = this.runtimeAvailable();
    const signer = settings.signerDirectory;
    const signerConfigured = !!signer && existsSync(path.join(signer, 'main.py'));
    return {
      sourceId: TIYI_SOURCE_ID,
      label: '浙大体艺',
      configured: runtimeAvailable && signerConfigured,
      credentialsConfigured,
      sessionSaved,
      runtimeAvailable,
      signerConfigured,
      reason: !runtimeAvailable
        ? '本机还没有体艺连接程序。'
        : !signerConfigured
          ? '本机还没有配置体艺应用连接组件。'
          : !credentialsConfigured && !sessionSaved
            ? '还没有保存校园账号或体艺登录。'
            : undefined,
    };
  }

  async catalog(signal?: AbortSignal): Promise<TiyiObservation> {
    return this.execute({ operation: 'catalog' }, signal);
  }

  async authenticate(signal?: AbortSignal): Promise<TiyiObservation> {
    return this.execute({ operation: 'authenticate', resource: 'profile', refresh: true }, signal);
  }

  async read(args: TiyiReadArgs, signal?: AbortSignal): Promise<TiyiObservation> {
    if (!resources.has(args.resource)) throw new Error('没有找到这项体艺查询。');
    if (
      args.snapshotId !== undefined &&
      (typeof args.snapshotId !== 'string' || !/^[a-f0-9]{32}$/.test(args.snapshotId))
    )
      throw new Error('这份体艺记录的地址不完整，请重新打开。');
    if (args.refresh && args.snapshotId) throw new Error('这次正在续读原记录；需要新记录时请另开一次刷新。');
    if (
      args.snapshotId &&
      [
        args.schoolYear,
        args.termId,
        args.courseId,
        args.recordId,
        args.begin,
        args.end,
        args.period,
        args.validStatus,
        args.subpage,
        args.upstreamPage,
        args.venueSiteId,
        args.searchDate,
      ].some((value) => value !== undefined)
    )
      throw new Error('续读会保留原来的学期和查询范围；要换条件，请另开一次查询。');
    if (
      args.upstreamPage !== undefined &&
      (args.snapshotId ||
        !Number.isInteger(args.upstreamPage) ||
        args.upstreamPage < 0 ||
        args.upstreamPage > 100_000 ||
        !(
          (args.resource === 'training' && args.subpage === undefined) ||
          (args.resource === 'venues' && ['orders', 'training'].includes(args.subpage ?? '')) ||
          ['counselling', 'venue_entries'].includes(args.resource)
        ))
    )
      throw new Error('学校页码用于场馆、培训、辅导站或出入记录的新查询；保存的记录请沿原地址继续。');
    if (args.venueSiteId !== undefined || args.searchDate !== undefined) {
      if (
        args.snapshotId ||
        args.upstreamPage !== undefined ||
        args.resource !== 'venues' ||
        (args.subpage !== undefined && !['reservation', 'art_reservation'].includes(args.subpage)) ||
        typeof args.venueSiteId !== 'string' ||
        !args.venueSiteId ||
        args.venueSiteId.length > 160 ||
        /[\r\n\0]/.test(args.venueSiteId) ||
        typeof args.searchDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(args.searchDate) ||
        !Number.isFinite(Date.parse(args.searchDate + 'T00:00:00Z')) ||
        new Date(args.searchDate + 'T00:00:00Z').toISOString().slice(0, 10) !== args.searchDate
      )
        throw new Error('请从学校场馆目录中选择场地，并同时提供有效的学校日期；保存的记录请沿原地址继续。');
    }
    if (
      args.pointer &&
      (args.pointer.length > 2048 ||
        !args.pointer.startsWith('/') ||
        /(?:token|secret|password|cookie|authorization)/i.test(args.pointer))
    )
      throw new Error('这个位置不能读取，请从体艺记录正文继续。');
    if (args.period !== undefined && !['WEEK', 'MONTH', 'TERM'].includes(args.period))
      throw new Error('请选择周、月或学期统计。');
    if (args.validStatus !== undefined && ![-1, 0, 1].includes(args.validStatus))
      throw new Error('请选择有效、无效或待审核记录。');
    if (
      args.subpage !== undefined &&
      ![
        'results',
        'schedule',
        'feedback',
        'records',
        'mine',
        'attendance',
        'orders',
        'buddies',
        'training',
        'reservation',
        'art_reservation',
        'certificates',
      ].includes(args.subpage)
    )
      throw new Error('没有找到这个体艺子页面。');
    if (
      [args.begin, args.end].some(
        (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
      )
    )
      throw new Error('统计时间需要完整的学校时间范围。');
    if (
      args.begin !== undefined &&
      args.end !== undefined &&
      (args.end < args.begin || args.end - args.begin > 730 * 86400000)
    )
      throw new Error('请选择不超过两年的起止时间。');
    if (
      !args.snapshotId &&
      args.resource === 'statistics' &&
      (args.begin === undefined || args.end === undefined || args.period === undefined)
    )
      throw new Error('统计需要起止时间和周、月或学期范围。');
    for (const value of [args.recordId, args.courseId, args.schoolYear, args.termId]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 160 || /[\r\n\0]/.test(value)))
        throw new Error('课程、学期或记录编号不完整，请从学校列表中重新选择。');
    }
    if (args.resource === 'prejudgment' || args.resource === 'savesports') {
      if (args.snapshotId || args.refresh)
        throw new Error('锻炼提交不能续读已保存的记录，也不能合并其他查询。');
      if (
        args.sportId !== undefined &&
        (typeof args.sportId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(args.sportId))
      )
        throw new Error('学校运动编号不完整，请先读取运动编号。');
      if (
        args.sportTypeId !== undefined &&
        (typeof args.sportTypeId !== 'string' || !/^\d{1,12}$/.test(args.sportTypeId))
      )
        throw new Error('学校场地编号不完整，请先从锻炼规则中选择场地。');
      if (
        args.track !== undefined &&
        (!Array.isArray(args.track) || args.track.length < 2 || args.track.length > 4000)
      )
        throw new Error('提交需要至少两个由设备真实采集的轨迹点。');
    }
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 10;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('每次可读取 1 到 100 条体艺记录。');
    const settings = this.hostSettings();
    const submission = args.resource === 'prejudgment' || args.resource === 'savesports';
    return this.execute(
      {
        operation: 'read',
        ...args,
        offset,
        limit,
        ...(submission
          ? {
              allowSportSubmit: settings.allowSportSubmit === true,
              sportEncoder: settings.sportEncoder ?? 'plain',
            }
          : {}),
      },
      signal,
    );
  }

  private execute(request: Record<string, unknown>, signal?: AbortSignal): Promise<TiyiObservation> {
    if (signal?.aborted) return Promise.reject(new Error('这次体艺查询已停下。'));
    const helper = this.connectorPath();
    if (!this.runtimeAvailable())
      return Promise.reject(new Error('本机的体艺连接文件不完整，请重新安装当前版本后再试。'));
    mkdirSync(this.privateDirectory, { recursive: true });
    const transport = this.options.getTransport ? this.options.getTransport() : this.options.transport;
    const settings = this.hostSettings();
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };
      for (const key of Object.keys(env))
        if (/API_KEY|TOKEN|AUTHORIZATION|COOKIE|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY/i.test(key))
          delete env[key];
      const child = spawn(this.options.python ?? process.env.ZAICHANG_PYTHON ?? 'python', [helper], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });
      const terminate = () => {
        // The optional signer is a child of Python. End this owned tree as one
        // operation so cancellation leaves no signer running after the query.
        if (process.platform === 'win32' && child.pid) {
          const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          cleanup.once('error', () => child.kill());
        } else child.kill();
      };
      const timer = setTimeout(() => {
        terminate();
        finish(new Error('学校这次还没有答复，查询已停下。可以稍后重试。'));
      }, 120_000);
      let stdout = '';
      let response: TiyiObservation | undefined;
      const transportController = new AbortController();
      let settled = false;
      const abort = () => {
        terminate();
        finish(new Error('这次体艺查询已停下。'));
      };
      const finish = (error?: Error, value?: TiyiObservation) => {
        if (settled) return;
        settled = true;
        transportController.abort();
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(value!);
      };
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf8');
      const receive = (line: string) => {
        if (!line.trim() || settled) return;
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.kind === 'tiyi_http_request') {
            const id = message.id;
            if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || !transport) throw new Error();
            void transport(message.request as TiyiHttpRequest, transportController.signal)
              .then((value) => {
                if (!settled && !child.stdin.destroyed)
                  child.stdin.write(JSON.stringify({ id, response: value }) + '\n');
              })
              .catch((error) => {
                if (!settled && !child.stdin.destroyed)
                  child.stdin.write(
                    JSON.stringify({
                      id,
                      error:
                        error instanceof TiyiTransportError
                          ? { code: error.code, message: error.message }
                          : {
                              code: 'SCHOOL_TRANSPORT_FAILED',
                              message: '校园连接暂时没有完成，请稍后重试。',
                            },
                    }) + '\n',
                  );
              });
          } else {
            response = message as unknown as TiyiObservation;
            if (!child.stdin.writableEnded) child.stdin.end();
          }
        } catch {
          terminate();
          finish(new Error('这次体艺连接回复没有读完整，请重新查询。'));
        }
      };
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 2 * 1024 * 1024) {
          terminate();
          finish(new Error('学校返回的内容太多，请缩小范围后继续。'));
        }
        let boundary: number;
        while ((boundary = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, boundary);
          stdout = stdout.slice(boundary + 1);
          receive(line);
        }
      });
      // Python errors can contain private URLs; only its structured public result is exposed.
      child.stderr.resume();
      child.once('error', () => finish(new Error('体艺连接程序没有启动，请检查本机 Python。')));
      child.once('close', (code) => {
        if (settled) return;
        try {
          if (stdout.trim()) receive(stdout);
          if (settled) return;
          const result = response!;
          const expectedResource = request.resource ?? 'menus';
          const selection = result.coverage?.venueSelection;
          const selectionFields = [
            'resource',
            'subpage',
            'directoryPointer',
            'venueMapField',
            'siteMapField',
            'idField',
            'dateFormat',
            'timeZone',
          ];
          const validSelection =
            selection === undefined ||
            (!!selection &&
              typeof selection === 'object' &&
              !Array.isArray(selection) &&
              result.resource === 'venues' &&
              selection.resource === 'venues' &&
              ['reservation', 'art_reservation'].includes(selection.subpage) &&
              ['/response/data', '/directoryResponse/data'].includes(selection.directoryPointer) &&
              selection.venueMapField === 'venueInfo' &&
              selection.siteMapField === 'venueSiteInfo' &&
              selection.idField === 'id' &&
              selection.dateFormat === 'YYYY-MM-DD' &&
              selection.timeZone === 'Asia/Shanghai' &&
              Object.keys(selection).length === selectionFields.length &&
              Object.keys(selection).every((key) => selectionFields.includes(key)));
          if (
            result.sourceId !== TIYI_SOURCE_ID ||
            result.resource !== expectedResource ||
            !validSelection ||
            !['fresh', 'saved', 'partial', 'auth_required', 'unavailable'].includes(result.status) ||
            typeof result.coverage?.complete !== 'boolean' ||
            (result.coverage.profileRead !== undefined && typeof result.coverage.profileRead !== 'boolean') ||
            !['records', 'official_page', 'catalog', 'unknown'].includes(result.coverage.kind) ||
            typeof result.observedAt !== 'string' ||
            !Number.isFinite(Date.parse(result.observedAt)) ||
            (result.snapshotId !== undefined && !/^[a-f0-9]{32}$/.test(result.snapshotId)) ||
            (result.coverage.next !== undefined &&
              (!/^[a-f0-9]{32}$/.test(result.coverage.next.snapshotId) ||
                !Number.isInteger(result.coverage.next.offset) ||
                result.coverage.next.offset < 0)) ||
            (result.coverage.upstreamNext !== undefined &&
              (!Number.isInteger(result.coverage.upstreamNext.upstreamPage) ||
                result.coverage.upstreamNext.upstreamPage < 0 ||
                result.coverage.upstreamNext.upstreamPage > 100_000 ||
                !(
                  (result.coverage.upstreamNext.resource === 'training' &&
                    result.coverage.upstreamNext.subpage === undefined) ||
                  (result.coverage.upstreamNext.resource === 'venues' &&
                    ['orders', 'training'].includes(result.coverage.upstreamNext.subpage ?? '')) ||
                  (['counselling', 'venue_entries'].includes(result.coverage.upstreamNext.resource) &&
                    (result.coverage.upstreamNext.termId === undefined ||
                      (typeof result.coverage.upstreamNext.termId === 'string' &&
                        /^[A-Za-z0-9_-]{1,160}$/.test(result.coverage.upstreamNext.termId))))
                )))
          )
            throw new Error();
          finish(undefined, result);
        } catch {
          finish(
            new Error(
              code === 0 ? '这次体艺回复没有读完整，请重新查询。' : '这次体艺查询没有完成，请稍后重试。',
            ),
          );
        }
      });
      child.stdin.on('error', () => {
        if (!settled) {
          terminate();
          finish(new Error('这次体艺查询没有送到本机连接程序。'));
        }
      });
      const input =
        JSON.stringify({
          ...request,
          privateDirectory: this.privateDirectory,
          legacyDirectory: settings.legacyDirectory,
          signerDirectory: settings.signerDirectory,
          signerDependencies: settings.signerDependencies,
          hostTransport: !!transport,
        }) + '\n';
      if (transport) child.stdin.write(input);
      else child.stdin.end(input);
    });
  }
}
