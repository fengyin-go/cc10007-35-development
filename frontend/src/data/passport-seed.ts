import type { CatalogPassport, PassportDb, SignLedger } from './passport-types'

/**
 * 目录护照种子库：
 *  - CATA-0001 有 v1（已换发）与 v2（现行）两本护照，旧护照与 v1 契约并存
 *  - CATA-0002 一本现行护照
 *  - CATA-0003 尚无护照，只有一本 running 台账：首行 CAT 已签、其余未签，演示断点续签
 * 种子时间戳固定，保证检索排序稳定。
 */

const PP_0001: CatalogPassport = {
  passportId: 'PP-2026-0001',
  versionNo: 1,
  rootId: 'ROOT-2026-0001',
  catalogEntryId: 'CATA-0001',
  name: '订单事实数据集',
  layer: 'ADS应用层',
  tags: ['交易', '核心域', '日增'],
  path: 'hdfs://lakehouse/ads/trade/ads_order_fact',
  status: 'revised',
  outputContract: 'contract/ads_order_fact@v1',
  fieldRevisions: [
    {
      revId: 'FR-0001',
      fieldName: 'order_id',
      dataType: 'STRING',
      nullable: false,
      changeClass: 'semantic',
      changeSummary: '新增订单主键，写入输出契约主键位',
      sourceSchemaId: 'SCHE-0101',
      status: '生效',
      createdAt: '2026-09-01T09:00:00.000Z',
    },
    {
      revId: 'FR-0002',
      fieldName: 'order_amount',
      dataType: 'DECIMAL(18,2)',
      nullable: false,
      changeClass: 'semantic',
      changeSummary: '金额语义由「元」重定义为「分」，口径不兼容',
      sourceSchemaId: 'SCHE-0102',
      status: '生效',
      createdAt: '2026-09-01T09:00:00.000Z',
    },
  ],
  adsReleases: [
    {
      releaseId: 'RLS-0001',
      adsDatasetId: 'ADS-0001',
      outputTable: 'ads_order_fact',
      outputContract: 'contract/ads_order_fact@v1',
      versionNo: 1,
      releasedAt: '2026-09-01T09:05:00.000Z',
      status: '在服',
    },
  ],
  qualRulings: [
    {
      rulingId: 'RUL-0001',
      qualityRuleId: 'QUAL-0101',
      targetField: 'order_amount',
      verdict: '通过',
      reason: '金额非空率 100%，落在约定阈值内',
      ruledAt: '2026-09-01T09:03:00.000Z',
    },
  ],
  receipts: [
    { refType: 'CAT', refId: 'CATA-0001', label: '编目条目 CATA-0001 · 订单事实数据集', action: '签发', signed: true, signedAt: '2026-09-01T09:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0001', label: '字段修订 FR-0001 · order_id', action: '签收', signed: true, signedAt: '2026-09-01T09:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0002', label: '字段修订 FR-0002 · order_amount', action: '签收', signed: true, signedAt: '2026-09-01T09:06:00.000Z' },
    { refType: 'ADS', refId: 'RLS-0001', label: 'ADS 发布 RLS-0001', action: '签收', signed: true, signedAt: '2026-09-01T09:06:00.000Z' },
    { refType: 'QUAL', refId: 'RUL-0001', label: 'QUAL 裁定 RUL-0001', action: '签收', signed: true, signedAt: '2026-09-01T09:06:00.000Z' },
  ],
  createdAt: '2026-09-01T09:06:00.000Z',
  updatedAt: '2026-09-01T09:06:00.000Z',
}

const PP_0002: CatalogPassport = {
  passportId: 'PP-2026-0002',
  versionNo: 1,
  rootId: 'ROOT-2026-0002',
  catalogEntryId: 'CATA-0002',
  name: '客户画像宽表',
  layer: 'DWS汇总层',
  tags: ['客户', '画像', '标签'],
  path: 'hdfs://lakehouse/dws/customer/dws_customer_profile',
  status: 'issued',
  outputContract: 'contract/dws_customer_profile@v1',
  fieldRevisions: [
    {
      revId: 'FR-0003',
      fieldName: 'cust_id',
      dataType: 'STRING',
      nullable: false,
      changeClass: 'semantic',
      changeSummary: '客户号统一为 OneID 口径，与旧客户号不兼容',
      sourceSchemaId: 'SCHE-0201',
      status: '生效',
      createdAt: '2026-09-20T14:00:00.000Z',
    },
    {
      revId: 'FR-0004',
      fieldName: 'risk_level',
      dataType: 'TINYINT',
      nullable: true,
      changeClass: 'semantic',
      changeSummary: '风险等级由字符串码改为 1-5 数值档',
      sourceSchemaId: 'SCHE-0202',
      status: '生效',
      createdAt: '2026-09-20T14:00:00.000Z',
    },
  ],
  adsReleases: [
    {
      releaseId: 'RLS-0002',
      adsDatasetId: 'ADS-0002',
      outputTable: 'dws_customer_profile',
      outputContract: 'contract/dws_customer_profile@v1',
      versionNo: 1,
      releasedAt: '2026-09-20T14:05:00.000Z',
      status: '在服',
    },
  ],
  qualRulings: [
    {
      rulingId: 'RUL-0002',
      qualityRuleId: 'QUAL-0201',
      targetField: 'risk_level',
      verdict: '通过',
      reason: '风险等级取值全部落在 1-5 区间',
      ruledAt: '2026-09-20T14:03:00.000Z',
    },
  ],
  receipts: [
    { refType: 'CAT', refId: 'CATA-0002', label: '编目条目 CATA-0002 · 客户画像宽表', action: '签发', signed: true, signedAt: '2026-09-20T14:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0003', label: '字段修订 FR-0003 · cust_id', action: '签收', signed: true, signedAt: '2026-09-20T14:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0004', label: '字段修订 FR-0004 · risk_level', action: '签收', signed: true, signedAt: '2026-09-20T14:06:00.000Z' },
    { refType: 'ADS', refId: 'RLS-0002', label: 'ADS 发布 RLS-0002', action: '签收', signed: true, signedAt: '2026-09-20T14:06:00.000Z' },
    { refType: 'QUAL', refId: 'RUL-0002', label: 'QUAL 裁定 RUL-0002', action: '签收', signed: true, signedAt: '2026-09-20T14:06:00.000Z' },
  ],
  createdAt: '2026-09-20T14:06:00.000Z',
  updatedAt: '2026-09-20T14:06:00.000Z',
}

const PP_0003: CatalogPassport = {
  passportId: 'PP-2026-0003',
  versionNo: 2,
  rootId: 'ROOT-2026-0003',
  catalogEntryId: 'CATA-0001',
  name: '订单事实数据集',
  layer: 'ADS应用层',
  tags: ['交易', '核心域', '日增'],
  path: 'hdfs://lakehouse/ads/trade/ads_order_fact',
  status: 'issued',
  outputContract: 'contract/ads_order_fact@v2',
  fieldRevisions: [
    {
      revId: 'FR-0005',
      fieldName: 'pay_channel',
      dataType: 'STRING',
      nullable: true,
      changeClass: 'semantic',
      changeSummary: '新增支付渠道维度，改变下游聚合口径',
      sourceSchemaId: 'SCHE-0103',
      status: '生效',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
    {
      revId: 'FR-0006',
      fieldName: 'order_status_name',
      dataType: 'STRING',
      nullable: true,
      changeClass: 'label',
      changeSummary: '仅状态中文名展示调整，底层码值与语义不变',
      sourceSchemaId: 'SCHE-0104',
      status: '生效',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
  ],
  adsReleases: [
    {
      releaseId: 'RLS-0003',
      adsDatasetId: 'ADS-0001',
      outputTable: 'ads_order_fact',
      outputContract: 'contract/ads_order_fact@v2',
      versionNo: 2,
      releasedAt: '2026-10-15T10:05:00.000Z',
      status: '在服',
    },
  ],
  qualRulings: [
    {
      rulingId: 'RUL-0003',
      qualityRuleId: 'QUAL-0102',
      targetField: 'pay_channel',
      verdict: '观察',
      reason: '新维度历史回填不全，先观察一个发布周期',
      ruledAt: '2026-10-15T10:03:00.000Z',
    },
  ],
  receipts: [
    { refType: 'CAT', refId: 'CATA-0001', label: '编目条目 CATA-0001 · 订单事实数据集', action: '换发', signed: true, signedAt: '2026-10-15T10:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0005', label: '字段修订 FR-0005 · pay_channel', action: '签收', signed: true, signedAt: '2026-10-15T10:06:00.000Z' },
    { refType: 'field_rev', refId: 'FR-0006', label: '字段修订 FR-0006 · order_status_name', action: '签收', signed: true, signedAt: '2026-10-15T10:06:00.000Z' },
    { refType: 'ADS', refId: 'RLS-0003', label: 'ADS 发布 RLS-0003', action: '签收', signed: true, signedAt: '2026-10-15T10:06:00.000Z' },
    { refType: 'QUAL', refId: 'RUL-0003', label: 'QUAL 裁定 RUL-0003', action: '签收', signed: true, signedAt: '2026-10-15T10:06:00.000Z' },
  ],
  createdAt: '2026-10-15T10:06:00.000Z',
  updatedAt: '2026-10-15T10:06:00.000Z',
}

/** CATA-0003 的断点事务草稿：护照尚未落库，只活在台账草稿里 */
const PP_0004_DRAFT: CatalogPassport = {
  passportId: 'PP-2026-0004',
  versionNo: 1,
  rootId: 'ROOT-2026-0004',
  catalogEntryId: 'CATA-0003',
  name: '支付渠道对账集',
  layer: 'ODS贴源层',
  tags: ['支付', '对账', '稽核'],
  path: 'hdfs://lakehouse/ods/payment/ods_payment_channel',
  status: 'issued',
  outputContract: 'contract/ods_payment_channel@v1',
  fieldRevisions: [
    {
      revId: 'FR-0007',
      fieldName: 'channel_code',
      dataType: 'STRING',
      nullable: false,
      changeClass: 'semantic',
      changeSummary: '渠道码按支付机构枚举收窄，旧杂码不再合法',
      sourceSchemaId: 'SCHE-0301',
      status: '生效',
      createdAt: '2026-11-12T08:30:00.000Z',
    },
    {
      revId: 'FR-0008',
      fieldName: 'channel_name',
      dataType: 'STRING',
      nullable: true,
      changeClass: 'label',
      changeSummary: '渠道展示名更名，码值与语义不变',
      sourceSchemaId: 'SCHE-0302',
      status: '生效',
      createdAt: '2026-11-12T08:30:00.000Z',
    },
  ],
  adsReleases: [
    {
      releaseId: 'RLS-0004',
      adsDatasetId: 'ADS-0003',
      outputTable: 'ods_payment_channel',
      outputContract: 'contract/ods_payment_channel@v1',
      versionNo: 1,
      releasedAt: '2026-11-12T08:32:00.000Z',
      status: '在服',
    },
  ],
  qualRulings: [
    {
      rulingId: 'RUL-0004',
      qualityRuleId: 'QUAL-0301',
      targetField: 'channel_code',
      verdict: '阻断',
      reason: '存在 3.2% 旧杂码记录，按阻断级别挂起发布',
      ruledAt: '2026-11-12T08:31:00.000Z',
    },
  ],
  receipts: [],
  createdAt: '2026-11-12T08:33:00.000Z',
  updatedAt: '2026-11-12T08:33:00.000Z',
}

function signedLedger(
  ledgerId: string,
  rootId: string,
  passportId: string,
  catalogEntryId: string,
  versionNo: number,
  event: SignLedger['event'],
  at: string,
): SignLedger {
  const passport = [PP_0001, PP_0002, PP_0003].find((item) => item.passportId === passportId)
  if (!passport) {
    throw new Error(`种子护照 ${passportId} 不存在`)
  }
  return {
    ledgerId,
    rootId,
    catalogEntryId,
    passportId,
    versionNo,
    event,
    startedAt: at,
    finishedAt: at,
    status: 'signed',
    receipts: passport.receipts.map((line) => ({ ...line })),
    draft: null,
    note: '同笔事务全部签收完成',
  }
}

const RUNNING_LEDGER: SignLedger = {
  ledgerId: 'LG-2026-0004',
  rootId: 'ROOT-2026-0004',
  catalogEntryId: 'CATA-0003',
  passportId: null,
  versionNo: 1,
  event: 'issue',
  startedAt: '2026-11-12T08:33:00.000Z',
  finishedAt: null,
  status: 'running',
  receipts: [
    { refType: 'CAT', refId: 'CATA-0003', label: '编目条目 CATA-0003 · 支付渠道对账集', action: '签发', signed: true, signedAt: '2026-11-12T08:33:05.000Z' },
    { refType: 'field_rev', refId: 'FR-0007', label: '字段修订 FR-0007 · channel_code', action: '签收', signed: false, signedAt: null },
    { refType: 'field_rev', refId: 'FR-0008', label: '字段修订 FR-0008 · channel_name', action: '签收', signed: false, signedAt: null },
    { refType: 'ADS', refId: 'RLS-0004', label: 'ADS 发布 RLS-0004', action: '签收', signed: false, signedAt: null },
    { refType: 'QUAL', refId: 'RUL-0004', label: 'QUAL 裁定 RUL-0004', action: '签收', signed: false, signedAt: null },
  ],
  draft: PP_0004_DRAFT,
  note: '断点演示：CAT 已签后事务中断，恢复时只续未签行，草稿原样落库',
}

export const SEED_PASSPORT_DB: PassportDb = {
  passports: [PP_0001, PP_0002, PP_0003],
  ledgers: [
    signedLedger('LG-2026-0001', 'ROOT-2026-0001', 'PP-2026-0001', 'CATA-0001', 1, 'issue', '2026-09-01T09:06:00.000Z'),
    signedLedger('LG-2026-0002', 'ROOT-2026-0002', 'PP-2026-0002', 'CATA-0002', 1, 'issue', '2026-09-20T14:06:00.000Z'),
    signedLedger('LG-2026-0003', 'ROOT-2026-0003', 'PP-2026-0003', 'CATA-0001', 2, 'revise', '2026-10-15T10:06:00.000Z'),
    RUNNING_LEDGER,
  ],
  seq: 100,
}
