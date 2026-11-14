<template>
  <div v-if="open" class="drawer-mask" @click.self="$emit('close')">
    <aside class="drawer">
      <header class="drawer-head">
        <div>
          <h3>目录护照 {{ passport?.passportId ?? '' }}</h3>
          <p class="page-desc">护照只追加，旧版与 output_contract 并存；回看时核对编目条目的目录命中快照。</p>
        </div>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </header>

      <div v-if="passport" class="drawer-body">
        <section class="panel">
          <div class="badge-row">
            <span class="badge" :class="`badge-${passport.status}`">{{ statusLabel(passport.status) }}</span>
            <span class="badge badge-neutral">v{{ passport.versionNo }}</span>
            <span class="badge badge-neutral">root：{{ passport.rootId }}</span>
          </div>
          <dl class="kv-grid">
            <div><dt>编目条目</dt><dd>{{ passport.catalogEntryId }} · {{ passport.name }}</dd></div>
            <div><dt>所属分层</dt><dd>{{ passport.layer }}</dd></div>
            <div><dt>业务标签</dt><dd>{{ passport.tags.join('、') || '—' }}</dd></div>
            <div><dt>存储路径</dt><dd class="mono">{{ passport.path }}</dd></div>
            <div><dt>output_contract</dt><dd class="mono">{{ passport.outputContract }}</dd></div>
            <div><dt>签发时间</dt><dd>{{ formatTime(passport.createdAt) }}</dd></div>
          </dl>
        </section>

        <section class="panel">
          <h4>目录命中核对（快照 vs 编目现值）</h4>
          <table class="data-table compact">
            <thead>
              <tr><th>命中项</th><th>护照快照</th><th>编目现值</th><th>核对</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in reconciliation" :key="row.key">
                <td>{{ row.label }}</td>
                <td>{{ row.snapshot }}</td>
                <td>{{ row.current }}</td>
                <td>
                  <span :class="row.match ? 'ok-text' : 'warn-text'">
                    {{ row.match ? '一致' : '已漂移' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h4>版本时间线（同条目全部护照）</h4>
          <div class="timeline">
            <button
              v-for="item in timeline"
              :key="item.passportId"
              class="timeline-item"
              :class="{ active: item.passportId === passport.passportId }"
              type="button"
              @click="$emit('switch', item.passportId)"
            >
              <span class="mono">{{ item.passportId }}</span>
              <span>v{{ item.versionNo }} · {{ statusLabel(item.status) }}</span>
              <span class="mono muted">{{ item.outputContract }}</span>
            </button>
          </div>
        </section>

        <section class="panel">
          <h4>field_rev 字段修订卡（{{ passport.fieldRevisions.length }} 张）</h4>
          <div class="card-columns">
            <div class="card-col">
              <h5 class="col-title semantic">语义不兼容（{{ semanticCards.length }}）</h5>
              <article v-for="card in semanticCards" :key="card.revId" class="field-card">
                <header>
                  <strong>{{ card.fieldName }}</strong>
                  <span class="badge badge-semantic">{{ card.revId }}</span>
                  <span class="badge" :class="card.status === '生效' ? 'badge-issued' : 'badge-retired'">{{ card.status }}</span>
                </header>
                <p class="muted">{{ card.changeSummary }}</p>
                <p class="mono small">{{ card.dataType }} · {{ card.nullable ? '可空' : '非空' }} · 溯源 {{ card.sourceSchemaId }}</p>
              </article>
              <p v-if="!semanticCards.length" class="empty-inline">本版无语义不兼容栏位</p>
            </div>
            <div class="card-col">
              <h5 class="col-title label">label-only（{{ labelCards.length }}）</h5>
              <article v-for="card in labelCards" :key="card.revId" class="field-card">
                <header>
                  <strong>{{ card.fieldName }}</strong>
                  <span class="badge badge-label">{{ card.revId }}</span>
                  <span class="badge" :class="card.status === '生效' ? 'badge-issued' : 'badge-retired'">{{ card.status }}</span>
                </header>
                <p class="muted">{{ card.changeSummary }}</p>
                <p class="mono small">{{ card.dataType }} · {{ card.nullable ? '可空' : '非空' }} · 溯源 {{ card.sourceSchemaId }}</p>
              </article>
              <p v-if="!labelCards.length" class="empty-inline">本版无 label-only 栏位</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <h4>ADS release 与 output_contract</h4>
          <table class="data-table compact">
            <thead>
              <tr><th>发布号</th><th>数据集</th><th>输出表</th><th>契约</th><th>版本</th><th>状态</th><th>发布时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="release in passport.adsReleases" :key="release.releaseId">
                <td class="mono">{{ release.releaseId }}</td>
                <td class="mono">{{ release.adsDatasetId }}</td>
                <td class="mono">{{ release.outputTable }}</td>
                <td class="mono">{{ release.outputContract }}</td>
                <td>v{{ release.versionNo }}</td>
                <td>{{ release.status }}</td>
                <td>{{ formatTime(release.releasedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h4>QUAL ruling 质量裁定</h4>
          <table class="data-table compact">
            <thead>
              <tr><th>裁定号</th><th>质量规则</th><th>目标字段</th><th>结论</th><th>理由</th><th>裁定时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="ruling in passport.qualRulings" :key="ruling.rulingId">
                <td class="mono">{{ ruling.rulingId }}</td>
                <td class="mono">{{ ruling.qualityRuleId }}</td>
                <td>{{ ruling.targetField }}</td>
                <td><span class="badge" :class="verdictClass(ruling.verdict)">{{ ruling.verdict }}</span></td>
                <td>{{ ruling.reason }}</td>
                <td>{{ formatTime(ruling.ruledAt) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h4>同笔签收记录（{{ signedCount }}/{{ passport.receipts.length }}）</h4>
          <table class="data-table compact">
            <thead>
              <tr><th>对象</th><th>编号</th><th>说明</th><th>动作</th><th>状态</th><th>签收时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="line in passport.receipts" :key="`${line.refType}-${line.refId}`">
                <td>{{ line.refType }}</td>
                <td class="mono">{{ line.refId }}</td>
                <td>{{ line.label }}</td>
                <td>{{ line.action }}</td>
                <td>
                  <span :class="line.signed ? 'ok-text' : 'warn-text'">{{ line.signed ? '已签' : '未签' }}</span>
                </td>
                <td>{{ line.signedAt ? formatTime(line.signedAt) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { listRows } from '@/data/local-store'
import { getPassport, passportTimeline } from '@/api/passport-service'
import { PASSPORT_STATUS_LABEL } from '@/data/passport-types'
import type { EntryRow } from '@/data/types'
import type { PassportStatus, QualVerdict } from '@/data/passport-types'

const props = defineProps<{ open: boolean; passportId: string | null }>()
defineEmits<{ close: []; switch: [passportId: string] }>()

const passport = computed(() => (props.passportId ? getPassport(props.passportId) : undefined))
const timeline = computed(() => (passport.value ? passportTimeline(passport.value.catalogEntryId) : []))

const semanticCards = computed(() => passport.value?.fieldRevisions.filter((card) => card.changeClass === 'semantic') ?? [])
const labelCards = computed(() => passport.value?.fieldRevisions.filter((card) => card.changeClass === 'label') ?? [])
const signedCount = computed(() => passport.value?.receipts.filter((line) => line.signed).length ?? 0)

const reconciliation = computed(() => {
  if (!passport.value) {
    return []
  }
  const current = listRows('catalog').find((row: EntryRow) => String(row['条目编号']) === passport.value?.catalogEntryId)
  const snapshot = passport.value
  const currentTags = current
    ? String(current['业务标签'] ?? '').split(',').map((tag) => tag.trim()).filter(Boolean).join('、')
    : '条目已缺失'
  const rows = [
    { key: 'name', label: 'name 数据集名称', snapshot: snapshot.name, current: current ? String(current['数据集名称']) : '—' },
    { key: 'layer', label: 'layer 所属分层', snapshot: snapshot.layer, current: current ? String(current['所属分层']) : '—' },
    { key: 'tag', label: 'tag 业务标签', snapshot: snapshot.tags.join('、'), current: currentTags },
    { key: 'path', label: 'path 存储路径', snapshot: snapshot.path, current: current ? String(current['存储路径']) : '—' },
  ]
  return rows.map((row) => ({ ...row, match: row.snapshot === row.current }))
})

function statusLabel(status: PassportStatus): string {
  return PASSPORT_STATUS_LABEL[status]
}

function verdictClass(verdict: QualVerdict): string {
  if (verdict === '通过') return 'badge-issued'
  if (verdict === '阻断') return 'badge-retired'
  return 'badge-revised'
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>
