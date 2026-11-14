<template>
  <section class="page" data-module="catalog">
    <header class="page-head">
      <div>
        <h2>编目检索 · 目录护照</h2>
        <p class="page-desc">
          catalog hit 按 name、layer、tag、path 钻到 field_rev、ADS release 与 QUAL ruling；
          护照只追加，reissue 新护照与旧 output_contract 并存，同笔事务签收。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openIssue(null)">签发护照</button>
        <button class="btn" type="button" @click="resetAll">重置护照库</button>
      </div>
    </header>

    <div v-if="runningCount" class="banner warn">
      有 {{ runningCount }} 本签收台账处于 running（断点未续），对应条目暂停新事务，请在「签收台账」页续签。
    </div>
    <div v-if="flashMessage" class="banner" :class="flashOk ? 'ok' : 'warn'">{{ flashMessage }}</div>

    <div class="tab-row">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <em v-if="tab.key === 'ledger' && runningCount" class="tab-dot">{{ runningCount }}</em>
      </button>
    </div>

    <!-- ① 目录命中：编目检索为主对象 -->
    <div v-show="activeTab === 'hits'">
      <form class="filter-bar" @submit.prevent="reloadHits">
        <label class="filter-item">
          <span>name 数据集名称</span>
          <input v-model="hitFilters.name" placeholder="按名称命中" />
        </label>
        <label class="filter-item">
          <span>layer 所属分层</span>
          <input v-model="hitFilters.layer" placeholder="如 ADS应用层" />
        </label>
        <label class="filter-item">
          <span>tag 业务标签</span>
          <input v-model="hitFilters.tag" placeholder="如 交易" />
        </label>
        <label class="filter-item">
          <span>path 存储路径</span>
          <input v-model="hitFilters.path" placeholder="路径片段" />
        </label>
        <button class="btn" type="submit">检索</button>
        <button class="btn ghost" type="button" @click="resetHitFilters">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>条目编号</th>
            <th>数据集名称</th>
            <th>所属分层</th>
            <th>业务标签</th>
            <th>存储路径</th>
            <th>负责人</th>
            <th>现行护照</th>
            <th>语义不兼容 / label-only</th>
            <th>断点台账</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="hit in hitRows" :key="hit.entryId">
            <td class="mono">{{ hit.entryId }}</td>
            <td>{{ hit.name }}</td>
            <td>{{ hit.layer }}</td>
            <td>
              <span v-for="tag in hit.tags" :key="tag" class="legend-item">{{ tag }}</span>
            </td>
            <td class="mono small">{{ hit.path }}</td>
            <td>{{ hit.owner }}</td>
            <td>
              <template v-if="hit.latestPassportId">
                <button class="link" type="button" @click="openPassport(hit.latestPassportId!)">
                  {{ hit.latestPassportId }} · v{{ hit.versionNo }}
                </button>
                <span class="muted">（{{ passportStatusLabel(hit.passportStatus) }}）</span>
              </template>
              <span v-else class="muted">未签发</span>
            </td>
            <td>
              <span class="badge badge-semantic">{{ hit.semanticCount }}</span>
              <span class="muted"> / </span>
              <span class="badge badge-label">{{ hit.labelCount }}</span>
            </td>
            <td>
              <button v-if="hit.runningLedgerId" class="link warn-text" type="button" @click="activeTab = 'ledger'">
                {{ hit.runningLedgerId }} 待续签
              </button>
              <span v-else class="muted">—</span>
            </td>
            <td class="row-actions">
              <button class="link" type="button" @click="openIssue(hit.entryId)">签发</button>
              <button class="link" type="button" :disabled="!hit.latestPassportId || !!hit.runningLedgerId" @click="openRevise(hit.entryId)">
                换发
              </button>
              <button class="link" type="button" :disabled="!hit.latestPassportId || !!hit.runningLedgerId" @click="retire(hit.entryId)">
                停用
              </button>
            </td>
          </tr>
          <tr v-if="!hitRows.length">
            <td colspan="10" class="empty-state">没有命中的编目条目，调整检索条件再试</td>
          </tr>
        </tbody>
      </table>
      <footer class="page-foot">
        <span>共 {{ hitRows.length }} 条目录命中，顺序按条目编号稳定排列</span>
      </footer>
    </div>

    <!-- ② 护照视图 -->
    <div v-show="activeTab === 'passports'">
      <form class="filter-bar" @submit.prevent="reloadPassports">
        <label class="filter-item">
          <span>护照号</span>
          <input v-model="passportQuery.passportId" placeholder="PP-2026-xxxx" />
        </label>
        <label class="filter-item">
          <span>layer</span>
          <input v-model="passportQuery.layer" placeholder="分层关键字" />
        </label>
        <label class="filter-item">
          <span>tag</span>
          <input v-model="passportQuery.tag" placeholder="标签关键字" />
        </label>
        <label class="filter-item">
          <span>护照状态</span>
          <select v-model="passportQuery.status">
            <option value="">全部</option>
            <option value="issued">现行</option>
            <option value="revised">已换发</option>
            <option value="retired">已停用</option>
          </select>
        </label>
        <label class="filter-item">
          <span>栏位类别</span>
          <select v-model="passportQuery.changeClass">
            <option value="">全部</option>
            <option value="semantic">含语义不兼容</option>
            <option value="label">含 label-only</option>
          </select>
        </label>
        <button class="btn" type="submit">定位</button>
        <button class="btn ghost" type="button" @click="resetPassportQuery">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>护照号</th>
            <th>编目条目</th>
            <th>版本</th>
            <th>状态</th>
            <th>root</th>
            <th>output_contract</th>
            <th>语义不兼容</th>
            <th>label-only</th>
            <th>签收</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="passport in passportRows" :key="passport.passportId">
            <td>
              <button class="link mono" type="button" @click="openPassport(passport.passportId)">{{ passport.passportId }}</button>
            </td>
            <td class="mono">{{ passport.catalogEntryId }} · {{ passport.name }}</td>
            <td>v{{ passport.versionNo }}</td>
            <td><span class="badge" :class="`badge-${passport.status}`">{{ passportStatusLabel(passport.status) }}</span></td>
            <td class="mono small">{{ passport.rootId }}</td>
            <td class="mono small">{{ passport.outputContract }}</td>
            <td>{{ passport.fieldRevisions.filter((c) => c.changeClass === 'semantic').length }}</td>
            <td>{{ passport.fieldRevisions.filter((c) => c.changeClass === 'label').length }}</td>
            <td>{{ passport.receipts.filter((line) => line.signed).length }}/{{ passport.receipts.length }}</td>
          </tr>
          <tr v-if="!passportRows.length">
            <td colspan="9" class="empty-state">没有满足条件的护照</td>
          </tr>
        </tbody>
      </table>
      <footer class="page-foot">
        <span>共 {{ passportRows.length }} 本护照，按条目编号、版本号、护照号稳定排序</span>
      </footer>
    </div>

    <!-- ③ 签收台账 -->
    <div v-show="activeTab === 'ledger'">
      <table class="data-table">
        <thead>
          <tr>
            <th>台账号</th>
            <th>事务</th>
            <th>编目条目</th>
            <th>root</th>
            <th>版本</th>
            <th>状态</th>
            <th>签收进度</th>
            <th>启动时间</th>
            <th>结案时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ledger in ledgerRows" :key="ledger.ledgerId">
            <td class="mono">{{ ledger.ledgerId }}</td>
            <td>{{ eventLabel(ledger.event) }}</td>
            <td class="mono">{{ ledger.catalogEntryId }}</td>
            <td class="mono small">{{ ledger.rootId }}</td>
            <td>v{{ ledger.versionNo ?? '—' }}</td>
            <td>
              <span class="badge" :class="ledger.status === 'running' ? 'badge-revised' : 'badge-issued'">
                {{ ledger.status === 'running' ? 'running' : 'signed' }}
              </span>
            </td>
            <td>
              <div class="progress">
                <div class="progress-bar" :style="{ width: progressPercent(ledger) + '%' }"></div>
              </div>
              <span class="small muted">{{ signedOf(ledger) }}/{{ ledger.receipts.length }} · {{ ledger.note }}</span>
            </td>
            <td class="small">{{ formatTime(ledger.startedAt) }}</td>
            <td class="small">{{ ledger.finishedAt ? formatTime(ledger.finishedAt) : '—' }}</td>
            <td>
              <button
                v-if="ledger.status === 'running'"
                class="btn primary small-btn"
                type="button"
                :disabled="busy"
                @click="resume(ledger.ledgerId)"
              >
                断点续签
              </button>
              <span v-else class="muted">已结案{{ ledger.passportId ? ' · ' + ledger.passportId : '' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PassportForm
      :open="formOpen"
      :mode="formMode"
      :entry-id="formEntryId"
      @close="formOpen = false"
      @submitted="handleSubmit"
    />
    <PassportDetailDrawer
      :open="drawerOpen"
      :passport-id="drawerPassportId"
      @close="drawerOpen = false"
      @switch="switchPassport"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  catalogHits,
  issuePassport,
  listLedgers,
  passportTimeline,
  queryPassports,
  resetPassports,
  resumeLedger,
  retirePassport,
  revisePassport,
} from '@/api/passport-service'
import { PASSPORT_EVENT_LABEL, PASSPORT_STATUS_LABEL } from '@/data/passport-types'
import type {
  CatalogHitView,
  CatalogPassport,
  IssuePassportInput,
  PassportEvent,
  PassportQuery,
  PassportStatus,
  SignLedger,
} from '@/data/passport-types'
import PassportDetailDrawer from './components/PassportDetailDrawer.vue'
import PassportForm from './components/PassportForm.vue'

const tabs = [
  { key: 'hits', label: '目录命中' },
  { key: 'passports', label: '护照视图' },
  { key: 'ledger', label: '签收台账' },
] as const

type TabKey = (typeof tabs)[number]['key']
const activeTab = ref<TabKey>('hits')

const hitRows = ref<CatalogHitView[]>([])
const passportRows = ref<CatalogPassport[]>([])
const ledgerRows = ref<SignLedger[]>([])

const hitFilters = reactive({ name: '', layer: '', tag: '', path: '' })
const passportQuery = reactive<PassportQuery>({
  passportId: '',
  layer: '',
  tag: '',
  status: '',
  changeClass: '',
})

const formOpen = ref(false)
const formMode = ref<'issue' | 'revise'>('issue')
const formEntryId = ref<string | null>(null)
const drawerOpen = ref(false)
const drawerPassportId = ref<string | null>(null)

const busy = ref(false)
const flashMessage = ref('')
const flashOk = ref(true)
let flashTimer: ReturnType<typeof setTimeout> | undefined

const runningCount = computed(() => ledgerRows.value.filter((ledger) => ledger.status === 'running').length)

function flash(message: string, ok = true) {
  flashMessage.value = message
  flashOk.value = ok
  if (flashTimer) {
    clearTimeout(flashTimer)
  }
  flashTimer = setTimeout(() => {
    flashMessage.value = ''
  }, 5000)
}

function reloadAll() {
  hitRows.value = catalogHits(hitFilters)
  passportRows.value = queryPassports(passportQuery)
  ledgerRows.value = listLedgers()
}

function reloadHits() {
  hitRows.value = catalogHits(hitFilters)
}

function reloadPassports() {
  passportRows.value = queryPassports(passportQuery)
}

function resetHitFilters() {
  hitFilters.name = ''
  hitFilters.layer = ''
  hitFilters.tag = ''
  hitFilters.path = ''
  reloadHits()
}

function resetPassportQuery() {
  passportQuery.passportId = ''
  passportQuery.layer = ''
  passportQuery.tag = ''
  passportQuery.status = ''
  passportQuery.changeClass = ''
  reloadPassports()
}

function openIssue(entryId: string | null) {
  formMode.value = 'issue'
  formEntryId.value = entryId
  formOpen.value = true
}

function openRevise(entryId: string) {
  const timeline = passportTimeline(entryId)
  if (!timeline.length) {
    flash('该条目还没有现行护照，不能换发', false)
    return
  }
  formMode.value = 'revise'
  formEntryId.value = entryId
  formOpen.value = true
}

async function handleSubmit(payload: IssuePassportInput) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    const ledger =
      formMode.value === 'issue'
        ? await issuePassport(payload)
        : await revisePassport(payload)
    formOpen.value = false
    reloadAll()
    if (ledger.status === 'running') {
      flash(`事务在台账 ${ledger.ledgerId} 处断点，已保留全部已签记录，可在签收台账续签`, false)
      activeTab.value = 'ledger'
    } else {
      flash(`护照已同笔签收完成，台账 ${ledger.ledgerId} 结案`)
    }
  } catch (error) {
    flash(error instanceof Error ? error.message : '护照事务执行失败', false)
  } finally {
    busy.value = false
  }
}

async function retire(entryId: string) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    const ledger = await retirePassport(entryId, '目录页发起停用')
    reloadAll()
    flash(`护照停用事务完成，台账 ${ledger.ledgerId} 结案`)
  } catch (error) {
    flash(error instanceof Error ? error.message : '停用失败', false)
  } finally {
    busy.value = false
  }
}

async function resume(ledgerId: string) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    const ledger = await resumeLedger(ledgerId)
    reloadAll()
    flash(`台账 ${ledger.ledgerId} 已续签结案，护照按事务草稿原样落库`)
  } catch (error) {
    flash(error instanceof Error ? error.message : '断点续签失败', false)
  } finally {
    busy.value = false
  }
}

function openPassport(passportId: string) {
  drawerPassportId.value = passportId
  drawerOpen.value = true
}

function switchPassport(passportId: string) {
  drawerPassportId.value = passportId
}

function resetAll() {
  resetPassports()
  reloadAll()
  flash('护照库已回到种子数据（编目条目数据不受影响）')
}

function passportStatusLabel(status: PassportStatus | null): string {
  return status ? PASSPORT_STATUS_LABEL[status] : '—'
}

function eventLabel(event: PassportEvent): string {
  return PASSPORT_EVENT_LABEL[event]
}

function signedOf(ledger: SignLedger): number {
  return ledger.receipts.filter((line) => line.signed).length
}

function progressPercent(ledger: SignLedger): number {
  if (!ledger.receipts.length) {
    return 0
  }
  return Math.round((signedOf(ledger) / ledger.receipts.length) * 100)
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

onMounted(reloadAll)
</script>
