/**
 * 目录护照领域类型。
 *
 * 一本「目录护照」把编目条目（CAT）与三类证据钉在一起：
 *  - field_rev：字段修订卡，分「语义不兼容」与「label-only」两类
 *  - ADS release：应用层发布记录，携带 output_contract
 *  - QUAL ruling：质量规则裁定
 * 护照只追加（reissue 生成新护照，旧护照并存），所有签收走同笔事务。
 */

/** 字段修订的变更类别：semantic=语义不兼容，label=仅展示名/注释变化（label-only） */
export type FieldChangeClass = 'semantic' | 'label'

export const FIELD_CHANGE_LABEL: Record<FieldChangeClass, string> = {
  semantic: '语义不兼容',
  label: 'label-only',
}

export type FieldCardStatus = '生效' | '作废'

export interface FieldRevisionCard {
  /** 字段修订卡编号，同一本护照内唯一，不复制卡 */
  revId: string
  fieldName: string
  dataType: string
  nullable: boolean
  changeClass: FieldChangeClass
  changeSummary: string
  /** 溯源：元数据管理（schema）里的字段定义编号 */
  sourceSchemaId: string
  status: FieldCardStatus
  createdAt: string
}

export interface AdsRelease {
  releaseId: string
  /** 关联应用层发布（ads 模块）的数据集编号 */
  adsDatasetId: string
  outputTable: string
  /** 输出契约名（含版本），旧契约随旧护照并存，不覆盖 */
  outputContract: string
  versionNo: number
  releasedAt: string
  status: '在服' | '已下线'
}

export type QualVerdict = '通过' | '阻断' | '观察'

export interface QualRuling {
  rulingId: string
  /** 溯源：质量校验（quality 模块）的规则编号 */
  qualityRuleId: string
  targetField: string
  verdict: QualVerdict
  reason: string
  ruledAt: string
}

/** 签收台账单行：CAT 事件、field_rev、ADS 与 QUAL 证据逐行同笔签收 */
export interface ReceiptLine {
  refType: 'CAT' | 'field_rev' | 'ADS' | 'QUAL'
  refId: string
  /** 展示用中文说明 */
  label: string
  action: string
  signed: boolean
  signedAt: string | null
}

export type PassportStatus = 'issued' | 'revised' | 'retired'

export const PASSPORT_STATUS_LABEL: Record<PassportStatus, string> = {
  issued: '现行',
  revised: '已换发',
  retired: '已停用',
}

export type PassportEvent = 'issue' | 'revise' | 'retire'

export const PASSPORT_EVENT_LABEL: Record<PassportEvent, string> = {
  issue: '签发',
  revise: '换发',
  retire: '停用',
}

export interface CatalogPassport {
  passportId: string
  /** 业务版本号：同一编目条目同 version_no 只允许一个 root 签发 */
  versionNo: number
  /** 事务 root 标识，并发签发只认一个 root */
  rootId: string
  catalogEntryId: string
  /** 以下四项为签发时编目条目的目录命中快照，回看时与条目现值核对 */
  name: string
  layer: string
  tags: string[]
  path: string
  status: PassportStatus
  /** 本版护照绑定的 output_contract；旧版契约随旧护照并存 */
  outputContract: string
  /** 本版新增的字段修订卡：reissue 不复制历史卡，按版本时间线回看 */
  fieldRevisions: FieldRevisionCard[]
  adsReleases: AdsRelease[]
  qualRulings: QualRuling[]
  /** 同笔签收记录，全量签完护照才允许落库 */
  receipts: ReceiptLine[]
  createdAt: string
  updatedAt: string
}

export type LedgerStatus = 'running' | 'signed'

/** 签收台账：事务启动即落库，断点后原样保留，恢复只续未签行 */
export interface SignLedger {
  ledgerId: string
  rootId: string
  catalogEntryId: string
  /** 护照在全部签收完成前不生成实体，落库后回填 */
  passportId: string | null
  versionNo: number | null
  event: PassportEvent
  startedAt: string
  finishedAt: string | null
  status: LedgerStatus
  receipts: ReceiptLine[]
  /**
   * 事务启动时一次性构造好的护照草稿（retire 无草稿）。
   * 断点恢复时原样落库，禁止重新计算，避免拼出半新半旧章。
   */
  draft: CatalogPassport | null
  note: string
}

export interface PassportDb {
  passports: CatalogPassport[]
  ledgers: SignLedger[]
  /** 各类编号自增序列，保证编号确定、检索结果稳定 */
  seq: number
}

/** 签发/换发表单录入的字段修订 */
export interface NewFieldInput {
  fieldName: string
  dataType: string
  nullable: boolean
  changeClass: FieldChangeClass
  changeSummary: string
  sourceSchemaId: string
}

/** 签发/换发表单录入的质量裁定 */
export interface NewRulingInput {
  qualityRuleId: string
  targetField: string
  verdict: QualVerdict
  reason: string
}

export interface IssuePassportInput {
  catalogEntryId: string
  versionNo: number
  outputContract: string
  fields: NewFieldInput[]
  adsDatasetId: string
  outputTable: string
  rulings: NewRulingInput[]
  /** 演示用：开启后事务在首行签收后制造断点，台账留 running */
  simulateBreak: boolean
}

/** 目录命中视图：以编目条目为主对象，护照信息附挂 */
export interface CatalogHitView {
  entryId: string
  name: string
  layer: string
  tags: string[]
  path: string
  owner: string
  entryStatus: string
  latestPassportId: string | null
  versionNo: number | null
  passportStatus: PassportStatus | null
  semanticCount: number
  labelCount: number
  runningLedgerId: string | null
}

export interface PassportQuery {
  passportId?: string
  catalogEntryId?: string
  layer?: string
  tag?: string
  status?: PassportStatus | ''
  changeClass?: FieldChangeClass | ''
}
