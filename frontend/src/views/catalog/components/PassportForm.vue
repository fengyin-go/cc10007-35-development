<template>
  <div v-if="open" class="drawer-mask" @click.self="$emit('close')">
    <aside class="drawer wide">
      <header class="drawer-head">
        <div>
          <h3>{{ mode === 'issue' ? '签发目录护照' : '换发目录护照（只追加新护照）' }}</h3>
          <p class="page-desc">CAT 的 issue/revise 与 field_rev、ADS release、QUAL ruling 同笔签收；同 version_no 并发只认一个 root。</p>
        </div>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </header>

      <div class="drawer-body">
        <section class="panel">
          <h4>编目条目与版本</h4>
          <div class="form-grid">
            <label class="form-item">
              <span>编目条目（目录命中对象）</span>
              <select v-model="form.catalogEntryId" :disabled="mode === 'revise'">
                <option v-for="hit in hits" :key="hit.entryId" :value="hit.entryId">
                  {{ hit.entryId }} · {{ hit.name }}（{{ hit.layer }}）
                </option>
              </select>
            </label>
            <label class="form-item">
              <span>version_no</span>
              <input v-model.number="form.versionNo" type="number" min="1" />
            </label>
            <label class="form-item grow-2">
              <span>output_contract（旧契约随旧护照并存）</span>
              <input v-model="form.outputContract" placeholder="例如 contract/ads_order_fact@v3" />
            </label>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title-row">
            <h4>field_rev 字段修订卡（语义不兼容 / label-only 两类）</h4>
            <button class="btn" type="button" @click="addField">追加一张卡</button>
          </div>
          <table class="data-table compact">
            <thead>
              <tr><th>字段名</th><th>类型</th><th>可空</th><th>变更类别</th><th>变更摘要</th><th>溯源字段编号</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(field, index) in form.fields" :key="index">
                <td><input v-model="field.fieldName" placeholder="如 pay_channel" /></td>
                <td><input v-model="field.dataType" placeholder="如 STRING" /></td>
                <td>
                  <select v-model="field.nullable">
                    <option :value="false">非空</option>
                    <option :value="true">可空</option>
                  </select>
                </td>
                <td>
                  <select v-model="field.changeClass">
                    <option v-for="option in changeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </td>
                <td><input v-model="field.changeSummary" placeholder="变更说明" /></td>
                <td><input v-model="field.sourceSchemaId" placeholder="SCHE-xxxx" /></td>
                <td><button class="link" type="button" @click="removeField(index)">移除</button></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h4>ADS release</h4>
          <div class="form-grid">
            <label class="form-item">
              <span>ADS 数据集编号</span>
              <input v-model="form.adsDatasetId" placeholder="ADS-xxxx" />
            </label>
            <label class="form-item">
              <span>输出表名</span>
              <input v-model="form.outputTable" placeholder="如 ads_order_fact" />
            </label>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title-row">
            <h4>QUAL ruling 质量裁定</h4>
            <button class="btn" type="button" @click="addRuling">追加一条裁定</button>
          </div>
          <table class="data-table compact">
            <thead>
              <tr><th>质量规则编号</th><th>目标字段</th><th>结论</th><th>理由</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(ruling, index) in form.rulings" :key="index">
                <td><input v-model="ruling.qualityRuleId" placeholder="QUAL-xxxx" /></td>
                <td><input v-model="ruling.targetField" placeholder="字段名" /></td>
                <td>
                  <select v-model="ruling.verdict">
                    <option v-for="verdict in verdictOptions" :key="verdict" :value="verdict">{{ verdict }}</option>
                  </select>
                </td>
                <td><input v-model="ruling.reason" placeholder="裁定理由" /></td>
                <td><button class="link" type="button" @click="removeRuling(index)">移除</button></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <label class="check-line">
            <input v-model="simulateBreak" type="checkbox" />
            模拟断点：首行 CAT 签收后中断，台账保留 running，用于验证「只续未签对象、不拼半新半旧章」
          </label>
        </section>
      </div>

      <footer class="drawer-foot">
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
        <div class="foot-actions">
          <button class="btn ghost" type="button" @click="$emit('close')">取消</button>
          <button class="btn primary" type="button" @click="submit">
            {{ mode === 'issue' ? '同笔签收并签发' : '同笔签收并换发' }}
          </button>
        </div>
      </footer>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import { CHANGE_CLASS_OPTIONS, VERDICT_OPTIONS, catalogHits, nextVersionNo } from '@/api/passport-service'
import type { IssuePassportInput, NewFieldInput, NewRulingInput } from '@/data/passport-types'

const props = defineProps<{ open: boolean; mode: 'issue' | 'revise'; entryId: string | null }>()
const emit = defineEmits<{ close: []; submitted: [payload: IssuePassportInput] }>()

const hits = catalogHits()
const changeOptions = CHANGE_CLASS_OPTIONS
const verdictOptions = VERDICT_OPTIONS
const errorMessage = ref('')
const simulateBreak = ref(false)

function emptyField(): NewFieldInput {
  return {
    fieldName: '',
    dataType: '',
    nullable: false,
    changeClass: 'semantic',
    changeSummary: '',
    sourceSchemaId: '',
  }
}

function emptyRuling(): NewRulingInput {
  return { qualityRuleId: '', targetField: '', verdict: '通过', reason: '' }
}

const form = reactive<IssuePassportInput>({
  catalogEntryId: '',
  versionNo: 1,
  outputContract: '',
  fields: [emptyField()],
  adsDatasetId: '',
  outputTable: '',
  rulings: [emptyRuling()],
  simulateBreak: false,
})

watch(
  () => [props.open, props.mode, props.entryId],
  () => {
    if (!props.open) {
      return
    }
    errorMessage.value = ''
    simulateBreak.value = false
    const entryId = props.entryId ?? hits[0]?.entryId ?? ''
    form.catalogEntryId = entryId
    form.versionNo = entryId ? nextVersionNo(entryId) : 1
    form.outputContract = ''
    form.fields = [emptyField()]
    form.adsDatasetId = ''
    form.outputTable = ''
    form.rulings = [emptyRuling()]
  },
  { immediate: true },
)

watch(
  () => form.catalogEntryId,
  (entryId) => {
    if (props.open && entryId && props.mode === 'issue') {
      form.versionNo = nextVersionNo(entryId)
    }
  },
)

function addField() {
  form.fields.push(emptyField())
}

function removeField(index: number) {
  form.fields.splice(index, 1)
}

function addRuling() {
  form.rulings.push(emptyRuling())
}

function removeRuling(index: number) {
  form.rulings.splice(index, 1)
}

function submit() {
  errorMessage.value = ''
  if (!form.catalogEntryId) {
    errorMessage.value = '请选择编目条目'
    return
  }
  if (form.fields.some((field) => !field.fieldName.trim() || !field.dataType.trim() || !field.sourceSchemaId.trim())) {
    errorMessage.value = '每张 field_rev 卡都要填字段名、类型与溯源字段编号'
    return
  }
  if (form.rulings.some((ruling) => !ruling.qualityRuleId.trim() || !ruling.targetField.trim())) {
    errorMessage.value = '每条 QUAL 裁定都要填质量规则编号与目标字段'
    return
  }
  if (!form.adsDatasetId.trim() || !form.outputTable.trim()) {
    errorMessage.value = 'ADS release 的数据集编号与输出表名不能为空'
    return
  }
  emit('submitted', {
    ...form,
    fields: form.fields.map((field) => ({ ...field })),
    rulings: form.rulings.map((ruling) => ({ ...ruling })),
    simulateBreak: simulateBreak.value,
  })
}
</script>
