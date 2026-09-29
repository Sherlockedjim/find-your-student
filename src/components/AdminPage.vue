<script setup lang="ts">
import { computed, ref, watch, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Download, Plus, Lock, Refresh } from '@element-plus/icons-vue'
import {
  STATUSES,
  TYPES,
  DISTRICTS,
  inferSlots,
  classifyTypes,
  parseTXT,
  publicAddress,
  type Candidate,
} from '../../shared/domain'
import {
  store,
  DEMO,
  isAdmin,
  isOwner,
  loadAdmin,
  parseUpload,
  confirmImport,
  saveOrder,
  archiveOrder,
  resolveException,
  geocodeCandidate,
  exportExcel,
  supabase,
  invokeFunction,
} from '../services'
import MapView from './MapView.vue'
const emit = defineEmits<{ login: [] }>()
function enterDemo() {
  store.demoAdmin = true
  store.demoUser = true
}
function showStatus(value: string) {
  status.value = value
  tab.value = 'orders'
}
const tab = ref('orders'),
  query = ref(''),
  status = ref(''),
  showArchived = ref(false),
  busy = ref(false),
  ai = ref(false)
const preview = ref<Candidate[]>([]),
  edit = ref<Candidate | null>(null),
  editMode = ref('existing'),
  editIndex = ref(-1),
  exceptionId = ref(''),
  mapOpen = ref(false)
const accounts = ref<any[]>([]),
  inviteEmail = ref('')
const filtered = computed(() =>
  store.privateOrders
    .filter(
      (o) =>
        (showArchived.value || !o.archived) &&
        (!status.value || status.value === o.status) &&
        (!query.value || [o.id, o.title, o.fullAddress].join(' ').includes(query.value)),
    )
    .sort((a, b) => b.id - a.id),
)
const counts = computed(() =>
  STATUSES.map((s) => ({
    name: s,
    count: store.privateOrders.filter((o) => !o.archived && o.status === s).length,
  })),
)
const modalVisible = computed({
  get: () => !!edit.value,
  set: (v) => {
    if (!v) edit.value = null
  },
})
async function run(fn: () => Promise<any>, message = '') {
  busy.value = true
  try {
    const r = await fn()
    if (message) ElMessage.success(message)
    return r
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    busy.value = false
  }
}
watch(
  () => isAdmin(),
  (yes) => {
    if (yes) void run(loadAdmin)
  },
  { immediate: true },
)
async function upload(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!file || !/\.txt$/i.test(file.name)) {
    ElMessage.warning('请上传 .txt 文件')
    return
  }
  if (file.size > 1024 * 1024) {
    ElMessage.warning('首版单次文件限制为1MB，请分批导入')
    return
  }
  await run(async () => {
    const bytes = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(bytes)
    preview.value = await parseUpload(text, file.name, ai.value)
    tab.value = 'import'
    ElMessage.success(`已解析 ${preview.value.length} 条，请核对预览后确认入库`)
  })
}
function open(c: Candidate, mode = 'existing', index = -1, eid = '') {
  edit.value = JSON.parse(JSON.stringify(c))
  editMode.value = mode
  editIndex.value = index
  exceptionId.value = eid
}
function newOrder() {
  const c = parseTXT('10000\n新学生单\n地址：\n时间：\n课酬：面议', '手动添加')[0]
  c.id = 0
  open(c, 'new')
}
async function importAll() {
  if (!preview.value.length) return
  try {
    await ElMessageBox.confirm(
      '正常编号单子会确认入库并上架；无地址单子保持待审核；重复或无效编号进入异常队列，不会覆盖已有单子。',
      '确认导入',
      { confirmButtonText: '确认入库', cancelButtonText: '返回核对' },
    )
  } catch {
    return
  }
  await run(async () => {
    const r = await confirmImport(preview.value)
    ElMessage.success(`入库 ${r.imported} 条，编号异常 ${r.exceptions} 条`)
    preview.value = []
    tab.value = r.exceptions ? 'exceptions' : 'orders'
  })
}
function refreshDerived(c: Candidate) {
  c.address = publicAddress(c.address)
  c.slots = inferSlots(c.scheduleText)
}
async function saveEdit() {
  const c = edit.value
  if (!c) return
  if (!Number.isSafeInteger(c.id) || c.id <= 0) {
    ElMessage.warning('请填写原始单子的正整数编号，不要自行顺延编号。')
    return
  }
  refreshDerived(c)
  await run(async () => {
    if (editMode.value === 'preview') preview.value[editIndex.value] = JSON.parse(JSON.stringify(c))
    else if (editMode.value === 'existing') await saveOrder(c)
    else {
      const r = await confirmImport([c])
      if (r.exceptions) throw new Error('编号仍重复，已保留异常，请核对正确原编号后再导入。')
      if (exceptionId.value) await resolveException(exceptionId.value)
    }
    edit.value = null
    ElMessage.success('已保存')
  })
}
async function archive(c: Candidate) {
  try {
    await ElMessageBox.confirm(
      `归档 #${c.id} 后不再公开，编号及原始资料保留，可从归档中恢复。`,
      '删除并归档',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await run(() => archiveOrder(c), '已归档，编号保留')
}
function exceptionCandidate(e: any): Candidate {
  if (e.candidate?.rawText !== undefined) return e.candidate
  const c = e.candidate
  return {
    ...c.public_data,
    id: Number(c.id),
    rawText: c.raw_text,
    fullAddress: c.full_address,
    sourceFile: c.source_file,
    anomalies: c.anomalies || [],
    duplicate: true,
  }
}
async function ignore(e: any) {
  try {
    await ElMessageBox.confirm('忽略此重复导入候选，不会删除原有单子；异常记录在数据库中保留。', '忽略候选')
  } catch {
    return
  }
  await run(async () => {
    await resolveException(e.id)
    await loadAdmin()
  })
}
async function locateEdit() {
  if (!edit.value?.address || edit.value.address === '位置待确认') {
    ElMessage.warning('先填写小区或街道')
    return
  }
  await run(() => geocodeCandidate(edit.value!), '已定位，请核对附近位置')
}
async function changeAddress() {
  if (edit.value) {
    edit.value.address = publicAddress(edit.value.fullAddress)
    edit.value.lng = null
    edit.value.lat = null
    edit.value.locationQuality = '待定位'
    if (!DEMO && edit.value.fullAddress.trim()) await locateEdit()
  }
}
async function changePublicAddress() {
  if (!edit.value) return
  edit.value.lng = null
  edit.value.lat = null
  edit.value.locationQuality = '待定位'
  if (!DEMO && edit.value.address.trim()) await locateEdit()
}
async function listAccounts() {
  if (DEMO || !isOwner()) return
  await run(async () => {
    const r = await supabase!.from('admin_accounts').select('*')
    if (r.error) throw r.error
    accounts.value = r.data
  })
}
watch(tab, (t) => {
  if (t === 'accounts') void listAccounts()
})
async function accountAction(action: string, userId?: string) {
  await run(async () => {
    await invokeFunction('admin-users', { action, email: inviteEmail.value, userId })
    inviteEmail.value = ''
    await listAccounts()
    ElMessage.success('账号操作成功')
  })
}
</script>
<template>
  <main class="admin-page">
    <section v-if="!isAdmin()" class="admin-gate">
      <div class="gate-icon">
        <el-icon><Lock /></el-icon>
      </div>
      <h1>管理员工作台</h1>
      <p>上传学生单、核对定位、管理申请与导出总表。<br />正式环境仅受邀请且启用的管理员可以进入。</p>
      <el-button type="primary" size="large" @click="emit('login')">管理员邮箱登录</el-button
      ><el-button v-if="DEMO" size="large" @click="enterDemo">体验演示后台</el-button
      ><small v-if="DEMO">演示后台仅操作本次浏览器会话的测试资料，不连接真实数据。</small>
    </section>
    <template v-else
      ><section class="admin-heading">
        <div>
          <span class="eyebrow">EDUS · ADMIN WORKSPACE</span>
          <h1>学生单管理</h1>
          <p>从零散文字，到有序、可筛选的学生单。</p>
        </div>
        <div class="admin-heading-actions">
          <el-button :icon="Refresh" @click="run(loadAdmin)">刷新</el-button
          ><el-button :icon="Download" @click="run(exportExcel)" :loading="busy">下载 Excel 总表</el-button
          ><el-button type="primary" :icon="Plus" @click="newOrder">添加学生单</el-button>
        </div>
      </section>
      <el-alert
        v-if="DEMO"
        type="warning"
        title="当前为演示后台：导入和编辑仅在本次会话有效。真实 student1.txt 请在正式后台上传，资料不会被打包到公开网站。"
        :closable="false"
        show-icon
      />
      <div class="stats-grid">
        <button
          v-for="s in counts"
          :key="s.name"
          :class="`stat-card status-${STATUSES.indexOf(s.name)}`"
          @click="showStatus(s.name)"
        >
          <span>{{ s.name }}</span
          ><strong>{{ s.count }}</strong
          ><small>查看学生单 →</small>
        </button>
      </div>
      <el-tabs v-model="tab" class="admin-tabs">
        <el-tab-pane label="学生单总表" name="orders"
          ><div class="admin-table-toolbar">
            <el-input v-model="query" clearable placeholder="搜索编号、标题、完整地址" /><el-select
              v-model="status"
              clearable
              placeholder="全部状态"
              ><el-option v-for="s in STATUSES" :key="s" :value="s" :label="s" /></el-select
            ><el-checkbox v-model="showArchived">包含归档</el-checkbox>
          </div>
          <el-table :data="filtered" stripe row-key="id" height="510"
            ><el-table-column prop="id" label="编号" width="95" sortable /><el-table-column
              prop="title"
              label="学生单"
              min-width="200"
            /><el-table-column label="类型" width="170"
              ><template #default="{ row }">{{ row.types.join('、') || '待分类' }}</template></el-table-column
            ><el-table-column label="状态" width="115"
              ><template #default="{ row }"
                ><span :class="`status-badge status-${STATUSES.indexOf(row.status)}`">{{
                  row.archived ? '已归档' : row.status
                }}</span></template
              ></el-table-column
            ><el-table-column prop="address" label="公开位置" min-width="180" /><el-table-column
              label="时薪"
              width="100"
              ><template #default="{ row }">{{
                row.hourlyPrice === null ? '面议' : `¥${row.hourlyPrice}`
              }}</template></el-table-column
            ><el-table-column label="定位" width="100"
              ><template #default="{ row }">{{
                row.lng !== null ? row.locationQuality : '待定位'
              }}</template></el-table-column
            ><el-table-column label="操作" width="150" fixed="right"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="open(row)">编辑</el-button
                ><el-button v-if="!row.archived" link type="danger" @click="archive(row)"
                  >删除归档</el-button
                ></template
              ></el-table-column
            ></el-table
          ></el-tab-pane
        >
        <el-tab-pane label="TXT 导入" name="import"
          ><div class="import-intro">
            <h2>上传 → 解析预览 → 确认入库</h2>
            <p>正常单子可批量入库，重复编号单独隔离；不会因一条异常阻塞其他单子。</p>
            <el-checkbox v-model="ai" :disabled="DEMO"
              >使用 DeepSeek 辅助解析（完整原文发送至 AI，产生 API 费用）</el-checkbox
            >
          </div>
          <el-upload
            drag
            accept=".txt,text/plain"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="upload"
            :disabled="busy"
            ><el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">拖入 TXT 文件，或 <em>点击上传</em></div>
            <template #tip
              ><div class="el-upload__tip">UTF-8 / GB18030 · 单次最多 1MB · 原始编号逐条保留</div></template
            ></el-upload
          ><template v-if="preview.length"
            ><div class="preview-heading">
              <strong>{{ preview.length }} 条解析结果</strong
              ><el-button type="primary" :loading="busy" @click="importAll">确认入库</el-button>
            </div>
            <el-table :data="preview" stripe
              ><el-table-column prop="id" label="编号" width="100" /><el-table-column
                prop="title"
                label="学生单"
                min-width="190"
              /><el-table-column prop="address" label="公开位置" min-width="170" /><el-table-column
                label="类型"
                min-width="140"
                ><template #default="{ row }">{{
                  row.types.join('、') || '待分类'
                }}</template></el-table-column
              ><el-table-column label="核对提醒" min-width="210"
                ><template #default="{ row }"
                  ><span :class="row.duplicate || !row.id ? 'inline-error' : 'muted'">{{
                    row.anomalies.join('；') || '解析正常'
                  }}</span></template
                ></el-table-column
              ><el-table-column label="操作" width="100"
                ><template #default="{ row, $index }"
                  ><el-button link type="primary" @click="open(row, 'preview', $index)"
                    >核对编辑</el-button
                  ></template
                ></el-table-column
              ></el-table
            ></template
          ></el-tab-pane
        >
        <el-tab-pane :label="`编号异常 (${store.exceptions.length})`" name="exceptions"
          ><el-alert
            title="仅纠正识别错误的编号；确实与原单相同则忽略候选，不要编造新编号。"
            type="info"
            :closable="false" /><el-table :data="store.exceptions"
            ><el-table-column prop="order_number" label="编号" width="110" /><el-table-column
              prop="reason"
              label="异常原因"
              min-width="260"
            /><el-table-column label="操作" width="220"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  @click="open(exceptionCandidate(row), 'exception', -1, row.id)"
                  >核对并修正后导入</el-button
                ><el-button link @click="ignore(row)">忽略</el-button></template
              ></el-table-column
            ></el-table
          ><el-empty v-if="!store.exceptions.length" description="暂无待处理编号异常" :image-size="90"
        /></el-tab-pane>
        <el-tab-pane :label="`访客申请 (${store.applications.length})`" name="applications"
          ><el-table :data="store.applications" stripe
            ><el-table-column prop="order_number" label="单子编号" width="110" /><el-table-column
              prop="nickname"
              label="昵称"
              width="110" /><el-table-column prop="wechat" label="微信" min-width="130" /><el-table-column
              prop="school"
              label="学校"
              min-width="150" /><el-table-column
              prop="available_time"
              label="可授课时间"
              min-width="160" /><el-table-column prop="note" label="说明" min-width="220" /><el-table-column
              prop="created_at"
              label="提交时间"
              width="200" /></el-table
          ><el-empty v-if="!store.applications.length" description="尚未收到申请" :image-size="90"
        /></el-tab-pane>
        <el-tab-pane v-if="isOwner() || DEMO" label="管理员账号" name="accounts"
          ><el-alert
            v-if="DEMO"
            title="演示模式不发送邀请；正式环境仅主管理员可邀请和停用其他管理员。"
            type="info"
            :closable="false"
          /><template v-else
            ><div class="admin-table-toolbar">
              <el-input v-model="inviteEmail" placeholder="受邀请管理员邮箱" /><el-button
                type="primary"
                :disabled="busy || !inviteEmail"
                @click="accountAction('invite')"
                >发送邮箱邀请</el-button
              >
            </div>
            <el-table :data="accounts"
              ><el-table-column prop="email" label="邮箱" /><el-table-column
                prop="role"
                label="角色"
              /><el-table-column label="启用状态"
                ><template #default="{ row }">{{
                  row.enabled ? '已启用' : '已停用'
                }}</template></el-table-column
              ><el-table-column label="操作"
                ><template #default="{ row }"
                  ><el-button
                    v-if="row.role !== 'owner'"
                    link
                    :type="row.enabled ? 'danger' : 'primary'"
                    @click="accountAction(row.enabled ? 'disable' : 'enable', row.user_id)"
                    >{{ row.enabled ? '停用' : '启用' }}</el-button
                  ></template
                ></el-table-column
              ></el-table
            ></template
          ></el-tab-pane
        >
      </el-tabs></template
    >
    <el-dialog
      v-model="modalVisible"
      :title="`${editMode === 'existing' ? '编辑' : '核对'}学生单 #${edit?.id || '待填写'}`"
      width="760px"
      top="5vh"
      ><el-form v-if="edit" label-position="top" class="edit-form"
        ><div class="edit-grid">
          <el-form-item label="原始编号"
            ><el-input-number
              v-model="edit.id"
              :min="0"
              :controls="false"
              :disabled="editMode === 'existing'" /></el-form-item
          ><el-form-item label="标题"><el-input v-model="edit.title" maxlength="180" /></el-form-item
          ><el-form-item label="类型（允许多选）"
            ><el-select v-model="edit.types" multiple placeholder="待分类"
              ><el-option v-for="t in TYPES" :key="t" :value="t" :label="t" /></el-select></el-form-item
          ><el-form-item label="状态"
            ><el-select v-model="edit.status"
              ><el-option v-for="s in STATUSES" :key="s" :value="s" :label="s" /></el-select></el-form-item
          ><el-form-item label="年级"><el-input v-model="edit.grade" /></el-form-item
          ><el-form-item label="科目"
            ><el-select v-model="edit.subjects" multiple allow-create filterable
              ><el-option
                v-for="s in ['数学', '英语', '语文', '物理', '化学', '全科', '日语', '奥数']"
                :key="s"
                :value="s"
                :label="s" /></el-select></el-form-item
          ><el-form-item label="每小时时薪（留空为面议）"
            ><el-input-number v-model="edit.hourlyPrice" :min="0" :controls="false" /></el-form-item
          ><el-form-item label="最高时薪"
            ><el-input-number v-model="edit.hourlyMax" :min="0" :controls="false"
          /></el-form-item>
        </div>
        <el-checkbox v-model="edit.priceEstimated">时薪按每次2小时估算</el-checkbox
        ><el-checkbox v-model="edit.archived">已归档（取消后可恢复）</el-checkbox
        ><el-form-item label="完整地址（仅后台可见）"
          ><el-input v-model="edit.fullAddress" type="textarea" :rows="2" @change="changeAddress"
        /></el-form-item>
        <div class="edit-grid">
          <el-form-item label="公开小区 / 街道（不能含详细门牌）"
            ><el-input v-model="edit.address" @change="changePublicAddress" /></el-form-item
          ><el-form-item label="区域"
            ><el-select v-model="edit.district" clearable
              ><el-option v-for="d in DISTRICTS" :key="d" :value="d" :label="d" /></el-select
          ></el-form-item>
        </div>
        <div class="coordinate-actions">
          <el-button @click="locateEdit" :loading="busy">根据公开位置重新定位</el-button
          ><el-button @click="mapOpen = true">地图选点</el-button
          ><span
            >{{ edit.lng?.toFixed(5) || '—' }}, {{ edit.lat?.toFixed(5) || '—' }} ·
            {{ edit.locationQuality }}</span
          >
        </div>
        <el-form-item label="授课时间 / 课期（筛选标签将根据此内容重新生成）"
          ><el-input v-model="edit.scheduleText" type="textarea" :rows="2" /><el-button
            link
            type="primary"
            @click="edit.types = classifyTypes(edit.scheduleText)"
            >从课期重新判断类型</el-button
          ></el-form-item
        ><el-form-item label="老师性别"
          ><el-select v-model="edit.teacherGender"
            ><el-option
              v-for="g in ['不限', '女老师', '男老师']"
              :key="g"
              :value="g"
              :label="g" /></el-select></el-form-item
        ><el-form-item label="老师要求（公开时自动隐藏联系方式）"
          ><el-input v-model="edit.requirements" type="textarea" :rows="3" /></el-form-item
        ><el-form-item label="学生情况（公开时自动隐藏隐私）"
          ><el-input v-model="edit.studentInfo" type="textarea" :rows="3" /></el-form-item
        ><el-form-item label="解析异常"
          ><el-input
            :model-value="edit.anomalies.join('；')"
            @update:model-value="
              (v: string) => edit && (edit.anomalies = v.split('；').filter(Boolean))
            " /></el-form-item
        ><el-collapse
          ><el-collapse-item title="查看原始文本（仅管理员）">
            <pre class="raw-text">{{ edit.rawText }}</pre>
          </el-collapse-item></el-collapse
        ></el-form
      ><template #footer
        ><el-button @click="edit = null">取消</el-button
        ><el-button type="primary" :loading="busy" @click="saveEdit"
          >保存{{ editMode === 'preview' ? '预览' : '' }}</el-button
        ></template
      ></el-dialog
    >
    <el-dialog v-model="mapOpen" title="调整公开近似位置" width="800px"
      ><div class="admin-map">
        <MapView
          :orders="edit ? [edit] : []"
          picking
          @pick="
            (p) => {
              if (edit) {
                edit.lng = p[0]
                edit.lat = p[1]
                edit.locationQuality = '近似位置'
                mapOpen = false
              }
            }
          "
        /></div
    ></el-dialog>
  </main>
</template>
