import { listRows, saveRows } from '@/data/local-store'
import { commitDb, passportDb, resetPassportDb } from '@/data/passport-store'
import {
  FIELD_CHANGE_LABEL,
} from '@/data/passport-types'
import type {
  AdsRelease,
  CatalogHitView,
  CatalogPassport,
  FieldChangeClass,
  FieldRevisionCard,
  IssuePassportInput,
  PassportEvent,
  PassportQuery,
  QualRuling,
  QualVerdict,
  ReceiptLine,
  SignLedger,
} from '@/data/passport-types'
import type { EntryRow } from '@/data/types'

/**
 * 目录护照服务。
 *
 * 一致性约定：
 * 1. CAT 的 issue/revise/retire 与 field_rev、ADS、QUAL 证据进同本台账，同笔签收；
 * 2. 事务启动先落 running 台账（含护照草稿），逐行签收；断点后只续未签行，草稿原样落库；
 * 3. 同一编目条目同 version_no 并发签发只认一个 root，后到者直接拒绝；
 * 4. 护照只追加：reissue 生成新护照，旧护照与旧 output_contract 并存；
 * 5. 所有列表按稳定键排序，同一数据多次检索结果顺序一致。
 */

export class PassportError extends Error {}

/** 进程内互斥：浏览器单标签页内的并发签发串行化，保证同 version_no 只有一个 root */
let txLock: Promise<unknown> = Promise.resolve()

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = txLock.then(task, task)
  // 锁本身不能因为业务失败而永久拒绝，失败也要释放
  txLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function nowIso(): string {
  return new Date().toISOString()
}

function nextId(prefix: string, width: number): string {
  const db = passportDb()
  db.seq += 1
  return `${prefix}-${String(db.seq).padStart(width, '0')}`
}

function getCatalogEntry(entryId: string): EntryRow {
  const rows = listRows('catalog')
  const row = rows.find((item) => String(item['条目编号']) === entryId)
  if (!row) {
    throw new PassportError(`目录命中失败：编目条目 ${entryId} 不存在`)
  }
  return row
}

function tagsOf(row: EntryRow): string[] {
  return String(row['业务标签'] ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function assertNoRunningLedger(entryId: string): void {
  const busy = passportDb().ledgers.find(
    (ledger) => ledger.catalogEntryId === entryId && ledger.status === 'running',
  )
  if (busy) {
    throw new PassportError(
      `编目条目 ${entryId} 存在未完成的签收台账 ${busy.ledgerId}，请先断点续签，禁止另起半新半旧章`,
    )
  }
}

function assertVersionNotTaken(entryId: string, versionNo: number, excludeRoot?: string): void {
  const clash = passportDb().passports.find(
    (passport) =>
      passport.catalogEntryId === entryId &&
      passport.versionNo === versionNo &&
      passport.rootId !== excludeRoot,
  )
  const draftClash = passportDb().ledgers.find(
    (ledger) =>
      ledger.status === 'running' &&
      ledger.catalogEntryId === entryId &&
      ledger.versionNo === versionNo &&
      ledger.rootId !== excludeRoot,
  )
  if (clash || draftClash) {
    throw new PassportError(
      `编目条目 ${entryId} 的 version_no=${versionNo} 已被 root ${(clash ?? draftClash)?.rootId} 签收，同一版本只认一个 root`,
    )
  }
}

function currentPassport(entryId: string): CatalogPassport | undefined {
  return passportDb()
    .passports.filter((passport) => passport.catalogEntryId === entryId && passport.status !== 'retired')
    .sort((a, b) => b.versionNo - a.versionNo || a.passportId.localeCompare(b.passportId))[0]
}

function buildReceipts(
  event: PassportEvent,
  entryId: string,
  name: string,
  cards: FieldRevisionCard[],
  release: AdsRelease,
  rulings: QualRuling[],
): ReceiptLine[] {
  const catAction = event === 'issue' ? '签发' : event === 'revise' ? '换发' : '停用'
  const lines: ReceiptLine[] = [
    { refType: 'CAT', refId: entryId, label: `编目条目 ${entryId} · ${name}`, action: catAction, signed: false, signedAt: null },
    ...cards.map((card) => ({
      refType: 'field_rev' as const,
      refId: card.revId,
      label: `字段修订 ${card.revId} · ${card.fieldName}（${FIELD_CHANGE_LABEL[card.changeClass]}）`,
      action: '签收',
      signed: false,
      signedAt: null,
    })),
    { refType: 'ADS', refId: release.releaseId, label: `ADS 发布 ${release.releaseId} · ${release.outputContract}`, action: '签收', signed: false, signedAt: null },
    ...rulings.map((ruling) => ({
      refType: 'QUAL' as const,
      refId: ruling.rulingId,
      label: `QUAL 裁定 ${ruling.rulingId} · ${ruling.verdict}`,
      action: '签收',
      signed: false,
      signedAt: null,
    })),
  ]
  return lines
}

function cloneReceipts(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.map((line) => ({ ...line }))
}

function persistLedger(ledger: SignLedger): void {
  const db = passportDb()
  const index = db.ledgers.findIndex((item) => item.ledgerId === ledger.ledgerId)
  const snapshot: SignLedger = {
    ...ledger,
    receipts: cloneReceipts(ledger.receipts),
    draft: ledger.draft ? { ...ledger.draft, receipts: cloneReceipts(ledger.draft.receipts) } : null,
  }
  if (index >= 0) {
    db.ledgers[index] = snapshot
  } else {
    db.ledgers.push(snapshot)
  }
  commitDb(db)
}

/**
 * 逐行签收：只动 signed=false 的行，已签行原样保留（同一护照接收不复制卡、不重复签）。
 * simulateBreak 在首行签收后制造断点：先落库再抛出，台账保持 running。
 */
async function signThrough(ledger: SignLedger, simulateBreak: boolean): Promise<void> {
  for (const line of ledger.receipts) {
    if (line.signed) {
      continue
    }
    line.signed = true
    line.signedAt = nowIso()
    if (simulateBreak) {
      // 工作副本与库存分离：断点处显式同步，保证刷新后读到的就是已签状态
      persistLedger(ledger)
      throw new PassportError(
        `模拟断点：台账 ${ledger.ledgerId} 在「${line.label}」签收后中断，未签对象保留，等待续签`,
      )
    }
    // 让出事件循环，暴露真实并发窗口
    await Promise.resolve()
  }
}

function applyCatalogLink(entryId: string, targetStatus: string): void {
  const rows = listRows('catalog')
  const index = rows.findIndex((row) => String(row['条目编号']) === entryId)
  if (index < 0) {
    throw new PassportError(`目录条目 ${entryId} 在提交时消失，事务回滚`)
  }
  const next = [...rows]
  next[index] = { ...next[index], status: targetStatus, pending: targetStatus !== '已下线' }
  saveRows('catalog', next)
}

function commitPassport(draft: CatalogPassport, event: PassportEvent): void {
  const db = passportDb()
  if (event === 'revise') {
    // 旧护照不删不改，只标记为已换发；旧 output_contract 随旧护照并存
    for (const passport of db.passports) {
      if (passport.catalogEntryId === draft.catalogEntryId && passport.status === 'issued') {
        passport.status = 'revised'
        passport.updatedAt = nowIso()
      }
    }
  }
  db.passports.push(draft)
  commitDb(db)
}

function finalizeLedger(ledger: SignLedger, passportId: string | null): void {
  const finishedAt = nowIso()
  // 回写工作副本，保证调用方拿到的返回值与库存快照同为结案态
  ledger.status = 'signed'
  ledger.finishedAt = finishedAt
  ledger.passportId = passportId
  ledger.note = '同笔事务全部签收完成'
  ledger.draft = null
  const finished: SignLedger = {
    ...ledger,
    receipts: cloneReceipts(ledger.receipts),
  }
  persistLedger(finished)
}

function buildDraft(input: IssuePassportInput, event: PassportEvent, entry: EntryRow): CatalogPassport {
  if (!input.fields.length) {
    throw new PassportError('至少需要登记一张 field_rev 字段修订卡，CAT 与 field_rev 必须同笔签收')
  }
  if (!input.outputContract.trim()) {
    throw new PassportError('output_contract 不能为空，旧契约随旧护照并存、新契约随新护照签发')
  }
  const cards: FieldRevisionCard[] = input.fields.map((field) => ({
    revId: nextId('FR', 4),
    fieldName: field.fieldName.trim(),
    dataType: field.dataType.trim(),
    nullable: field.nullable,
    changeClass: field.changeClass,
    changeSummary: field.changeSummary.trim(),
    sourceSchemaId: field.sourceSchemaId.trim(),
    status: '生效',
    createdAt: nowIso(),
  }))
  const release: AdsRelease = {
    releaseId: nextId('RLS', 4),
    adsDatasetId: input.adsDatasetId.trim(),
    outputTable: input.outputTable.trim(),
    outputContract: input.outputContract.trim(),
    versionNo: input.versionNo,
    releasedAt: nowIso(),
    status: '在服',
  }
  const rulings: QualRuling[] = input.rulings.map((ruling) => ({
    rulingId: nextId('RUL', 4),
    qualityRuleId: ruling.qualityRuleId.trim(),
    targetField: ruling.targetField.trim(),
    verdict: ruling.verdict,
    reason: ruling.reason.trim(),
    ruledAt: nowIso(),
  }))
  const passportId = nextId('PP', 8)
  const rootId = nextId('ROOT', 8)
  const receipts = buildReceipts(
    event,
    String(entry['条目编号']),
    String(entry['数据集名称']),
    cards,
    release,
    rulings,
  )
  return {
    passportId,
    versionNo: input.versionNo,
    rootId,
    catalogEntryId: String(entry['条目编号']),
    name: String(entry['数据集名称']),
    layer: String(entry['所属分层']),
    tags: tagsOf(entry),
    path: String(entry['存储路径']),
    status: 'issued',
    outputContract: release.outputContract,
    fieldRevisions: cards,
    adsReleases: [release],
    qualRulings: rulings,
    receipts,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

async function startIssueLike(event: PassportEvent, input: IssuePassportInput): Promise<SignLedger> {
  const entry = getCatalogEntry(input.catalogEntryId)
  assertNoRunningLedger(input.catalogEntryId)
  assertVersionNotTaken(input.catalogEntryId, input.versionNo)
  if (event === 'revise' && !currentPassport(input.catalogEntryId)) {
    throw new PassportError(`编目条目 ${input.catalogEntryId} 还没有现行护照，不能换发，请先签发`)
  }
  if (!Number.isInteger(input.versionNo) || input.versionNo <= 0) {
    throw new PassportError('version_no 必须是正整数')
  }

  const ledgerId = nextId('LG', 8)
  const draft = buildDraft(input, event, entry)
  const ledger: SignLedger = {
    ledgerId,
    rootId: draft.rootId,
    catalogEntryId: input.catalogEntryId,
    passportId: null,
    versionNo: input.versionNo,
    event,
    startedAt: nowIso(),
    finishedAt: null,
    status: 'running',
    receipts: cloneReceipts(draft.receipts),
    draft,
    note: '事务进行中：CAT 与 field_rev 同笔签收',
  }
  // 事务启动即落 running 台账（含护照草稿），库存对象与工作副本互不共享引用
  persistLedger(ledger)

  await signThrough(ledger, input.simulateBreak)
  // 全量签收后才允许护照落库；catalog 联动与护照提交连续完成，避免半新半旧
  commitPassport(draft, event)
  applyCatalogLink(input.catalogEntryId, '已发布')
  finalizeLedger(ledger, draft.passportId)
  return ledger
}

/** 签发新护照（issue） */
export function issuePassport(input: IssuePassportInput): Promise<SignLedger> {
  return withLock(() => startIssueLike('issue', input))
}

/** 换发：只追加新护照，旧护照与旧 output_contract 并存 */
export function revisePassport(input: IssuePassportInput): Promise<SignLedger> {
  return withLock(() => startIssueLike('revise', input))
}

/** 停用现行护照：CAT retire 与 field_rev 作废同笔签收，不产生新护照 */
export function retirePassport(entryId: string, reason: string, simulateBreak = false): Promise<SignLedger> {
  return withLock(async () => {
    getCatalogEntry(entryId)
    assertNoRunningLedger(entryId)
    const active = currentPassport(entryId)
    if (!active) {
      throw new PassportError(`编目条目 ${entryId} 没有现行护照可停用`)
    }
    const ledgerId = nextId('LG', 8)
    const rootId = nextId('ROOT', 8)
    const receipts: ReceiptLine[] = [
      { refType: 'CAT', refId: entryId, label: `编目条目 ${entryId} · ${active.name}`, action: '停用', signed: false, signedAt: null },
      ...active.fieldRevisions.map((card) => ({
        refType: 'field_rev' as const,
        refId: card.revId,
        label: `字段修订 ${card.revId} · ${card.fieldName} 随护照停用作废`,
        action: '停用签收',
        signed: false,
        signedAt: null,
      })),
    ]
    const ledger: SignLedger = {
      ledgerId,
      rootId,
      catalogEntryId: entryId,
      passportId: active.passportId,
      versionNo: active.versionNo,
      event: 'retire',
      startedAt: nowIso(),
      finishedAt: null,
      status: 'running',
      receipts,
      draft: null,
      note: reason.trim() || '护照停用事务',
    }
    persistLedger(ledger)

    await signThrough(ledger, simulateBreak)
    const targetDb = passportDb()
    const target = targetDb.passports.find((item) => item.passportId === active.passportId)
    if (!target) {
      throw new PassportError(`护照 ${active.passportId} 在停用提交时消失，事务中断`)
    }
    target.status = 'retired'
    target.updatedAt = nowIso()
    for (const card of target.fieldRevisions) {
      card.status = '作废'
    }
    commitDb(targetDb)
    applyCatalogLink(entryId, '已下线')
    finalizeLedger(ledger, active.passportId)
    return ledger
  })
}

/**
 * 断点续签：找到 running 台账，只续未签对象。
 * 不重新构造任何卡片——issue/revise 用启动时的草稿原样落库，retire 按原护照停用。
 */
export function resumeLedger(ledgerId: string): Promise<SignLedger> {
  return withLock(async () => {
    const db = passportDb()
    const stored = db.ledgers.find((item) => item.ledgerId === ledgerId)
    if (!stored) {
      throw new PassportError(`台账 ${ledgerId} 不存在`)
    }
    if (stored.status !== 'running') {
      throw new PassportError(`台账 ${ledgerId} 已结案，无需续签`)
    }
    // 取独立工作副本：库存快照不动，只在结案时整体替换，杜绝半新半旧
    const ledger: SignLedger = {
      ...stored,
      receipts: cloneReceipts(stored.receipts),
      draft: stored.draft ? { ...stored.draft, receipts: cloneReceipts(stored.draft.receipts) } : null,
    }
    // 恢复路径不注入断点：未签行逐行签完，保证收敛
    await signThrough(ledger, false)

    if (ledger.event === 'retire') {
      const targetDb = passportDb()
      const target = targetDb.passports.find((item) => item.passportId === ledger.passportId)
      if (!target) {
        throw new PassportError(`停用恢复失败：护照 ${ledger.passportId} 不存在`)
      }
      target.status = 'retired'
      target.updatedAt = nowIso()
      for (const card of target.fieldRevisions) {
        card.status = '作废'
      }
      commitDb(targetDb)
      applyCatalogLink(ledger.catalogEntryId, '已下线')
      finalizeLedger(ledger, ledger.passportId)
      return ledger
    }

    const draft = ledger.draft
    if (!draft) {
      throw new PassportError(`台账 ${ledgerId} 缺少护照草稿，无法恢复，禁止现场拼章`)
    }
    // 草稿是事务启动时的定稿，恢复时原样落库，不重新计算
    draft.receipts = ledger.receipts.map((line) => ({ ...line }))
    commitPassport(draft, ledger.event)
    applyCatalogLink(ledger.catalogEntryId, '已发布')
    finalizeLedger(ledger, draft.passportId)
    return ledger
  })
}

/** 目录命中视图：以编目检索为主对象，护照与断点台账作为附挂信息 */
export function catalogHits(filters: { name?: string; layer?: string; tag?: string; path?: string } = {}): CatalogHitView[] {
  const db = passportDb()
  const name = filters.name?.trim() ?? ''
  const layer = filters.layer?.trim() ?? ''
  const tag = filters.tag?.trim() ?? ''
  const path = filters.path?.trim() ?? ''

  const views = listRows('catalog').map((entry) => {
    const entryId = String(entry['条目编号'])
    const entryTags = tagsOf(entry)
    const passports = db.passports
      .filter((passport) => passport.catalogEntryId === entryId)
      .sort((a, b) => b.versionNo - a.versionNo || a.passportId.localeCompare(b.passportId))
    const latest = passports[0] ?? null
    const running = db.ledgers.find((ledger) => ledger.catalogEntryId === entryId && ledger.status === 'running') ?? null
    const allCards = passports.flatMap((passport) => passport.fieldRevisions)
    return {
      entryId,
      name: String(entry['数据集名称']),
      layer: String(entry['所属分层']),
      tags: entryTags,
      path: String(entry['存储路径']),
      owner: String(entry['负责人']),
      entryStatus: String(entry.status),
      latestPassportId: latest?.passportId ?? null,
      versionNo: latest?.versionNo ?? null,
      passportStatus: latest?.status ?? null,
      semanticCount: allCards.filter((card) => card.changeClass === 'semantic').length,
      labelCount: allCards.filter((card) => card.changeClass === 'label').length,
      runningLedgerId: running?.ledgerId ?? null,
    } satisfies CatalogHitView
  })

  return views
    .filter((view) => {
      if (name && !view.name.includes(name)) return false
      if (layer && !view.layer.includes(layer)) return false
      if (tag && !view.tags.some((item) => item.includes(tag))) return false
      if (path && !view.path.includes(path)) return false
      return true
    })
    .sort((a, b) => a.entryId.localeCompare(b.entryId))
}

/** 护照视图按条件定位；结果按条目编号、版本号、护照号稳定排序 */
export function queryPassports(query: PassportQuery = {}): CatalogPassport[] {
  const db = passportDb()
  return db.passports
    .filter((passport) => {
      if (query.passportId && !passport.passportId.includes(query.passportId.trim())) return false
      if (query.catalogEntryId && passport.catalogEntryId !== query.catalogEntryId) return false
      if (query.layer && !passport.layer.includes(query.layer.trim())) return false
      if (query.tag && !passport.tags.some((tag) => tag.includes(query.tag!.trim()))) return false
      if (query.status && passport.status !== query.status) return false
      if (query.changeClass && !passport.fieldRevisions.some((card) => card.changeClass === query.changeClass)) return false
      return true
    })
    .sort((a, b) => {
      const entryCmp = a.catalogEntryId.localeCompare(b.catalogEntryId)
      if (entryCmp !== 0) return entryCmp
      const versionCmp = b.versionNo - a.versionNo
      if (versionCmp !== 0) return versionCmp
      return a.passportId.localeCompare(b.passportId)
    })
}

export function getPassport(passportId: string): CatalogPassport | undefined {
  return passportDb().passports.find((passport) => passport.passportId === passportId)
}

/** 单本护照的版本时间线：同条目全部护照（含已换发、已停用），旧契约一并可回看 */
export function passportTimeline(entryId: string): CatalogPassport[] {
  return queryPassports({ catalogEntryId: entryId })
}

export function listLedgers(): SignLedger[] {
  return passportDb()
    .ledgers.map((ledger) => ({ ...ledger, receipts: ledger.receipts.map((line) => ({ ...line })) }))
    .sort((a, b) => {
      const statusCmp = a.status === b.status ? 0 : a.status === 'running' ? -1 : 1
      if (statusCmp !== 0) return statusCmp
      return a.ledgerId.localeCompare(b.ledgerId)
    })
}

export function resetPassports(): void {
  resetPassportDb()
}

export function nextVersionNo(entryId: string): number {
  const versions = passportDb()
    .passports.filter((passport) => passport.catalogEntryId === entryId)
    .map((passport) => passport.versionNo)
  const draftVersions = passportDb()
    .ledgers.filter((ledger) => ledger.status === 'running' && ledger.catalogEntryId === entryId)
    .map((ledger) => ledger.versionNo ?? 0)
  return Math.max(0, ...versions, ...draftVersions) + 1
}

export const CHANGE_CLASS_OPTIONS: { value: FieldChangeClass; label: string }[] = [
  { value: 'semantic', label: FIELD_CHANGE_LABEL.semantic },
  { value: 'label', label: FIELD_CHANGE_LABEL.label },
]

export const VERDICT_OPTIONS: QualVerdict[] = ['通过', '阻断', '观察']
