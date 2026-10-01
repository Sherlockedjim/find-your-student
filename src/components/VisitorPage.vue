<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Location, Refresh, Star, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import {
  TYPES,
  DAYS,
  PERIODS,
  DISTRICTS,
  defaultFilters,
  filterOrders,
  sortOrders,
  nextDaytime,
  type Order,
} from '../../shared/domain'
import {
  store,
  DEMO,
  loadOrders,
  toggleFavorite,
  isLoggedIn,
  submitApplication,
  transit,
  mapRequest,
} from '../services'
import MapView from './MapView.vue'
import OrderCard from './OrderCard.vue'
const emit = defineEmits<{ login: []; wechat: [] }>()
function pickOrigin() {
  originDialog.value = false
  picking.value = true
}
const filters = reactive(defaultFilters()),
  sort = ref('latest'),
  selected = ref<number>(),
  collapsed = ref(false)
const origin = ref<[number, number] | null>(null),
  originLabel = ref('设置我的出发点'),
  originDialog = ref(false),
  originText = ref(''),
  picking = ref(false),
  busy = ref(false)
const applying = ref<Order | null>(null),
  submitting = ref(false),
  applyForm = reactive({ nickname: '', wechat: '', school: '', available_time: '', note: '', website: '' })
const minuteCache = reactive<Record<number, number | null>>({})
const enriched = computed(() => store.orders.map((o) => ({ ...o, commuteMinutes: minuteCache[o.id] })))
const results = computed(() => sortOrders(filterOrders(enriched.value, filters, store.favorites), sort.value))
const markers = computed(() => results.value.filter((o) => o.status === '已上架'))
const filterCount = computed(
  () =>
    filters.types.length +
    filters.subjects.length +
    Number(!!filters.district) +
    Number(!!filters.day) +
    Number(!!filters.period) +
    Number(filters.price !== 'all') +
    Number(filters.minPrice !== null),
)
function reset() {
  Object.assign(filters, defaultFilters())
  sort.value = 'latest'
}
function flip(list: string[], value: string) {
  const i = list.indexOf(value)
  i < 0 ? list.push(value) : list.splice(i, 1)
}
function select(id: number) {
  selected.value = id
  collapsed.value = false
  setTimeout(
    () => document.getElementById(`order-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    80,
  )
}
async function favorite(id: number) {
  if (!isLoggedIn()) {
    emit('login')
    return
  }
  try {
    await toggleFavorite(id)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}
let searchTimer: ReturnType<typeof setTimeout>,
  epoch = 0
watch(
  () => filters.query,
  (q) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void loadOrders(q), 250)
  },
)
async function calculate() {
  if (!origin.value) {
    originDialog.value = true
    return
  }
  const token = ++epoch,
    point = [...origin.value] as [number, number]
  busy.value = true
  try {
    const list = store.orders.filter(
      (o) => o.lng !== null && o.lat !== null && minuteCache[o.id] === undefined,
    )
    let index = 0
    await Promise.all(
      [1, 2, 3].map(async () => {
        while (index < list.length && token === epoch) {
          const o = list[index++]
          const m = await transit(point, [o.lng!, o.lat!])
          if (token === epoch) minuteCache[o.id] = m
        }
      }),
    )
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    if (token === epoch) busy.value = false
  }
}
function setOrigin(p: [number, number], label: string) {
  epoch++
  busy.value = false
  Object.keys(minuteCache).forEach((k) => delete minuteCache[Number(k)])
  origin.value = p
  originLabel.value = label
  originDialog.value = false
  picking.value = false
  void calculate()
}
async function locate() {
  if (!navigator.geolocation) {
    originDialog.value = true
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      try {
        const r = await mapRequest({ action: 'convert', location: [p.coords.longitude, p.coords.latitude] })
        setOrigin(r.location, '我的当前位置')
      } catch (e) {
        ElMessage.error((e as Error).message)
        originDialog.value = true
      }
    },
    () => {
      ElMessage.warning('定位未获授权或失败，请手动输入地点或在地图选点。')
      originDialog.value = true
    },
    { timeout: 10000, maximumAge: 60000 },
  )
}
async function searchOrigin() {
  if (!originText.value.trim()) return
  try {
    const r = await mapRequest({ action: 'geocode', address: originText.value })
    if (!r.locations?.length) throw new Error('地点未找到，请选择地图点')
    setOrigin([r.locations[0].lng, r.locations[0].lat], originText.value)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}
watch(sort, (v) => {
  if (v === 'commute') void calculate()
})
watch(
  () => filters.maxCommute,
  (v) => {
    if (v !== null) void calculate()
  },
)
watch(
  () => store.orders,
  () => {
    if (origin.value && (sort.value === 'commute' || filters.maxCommute !== null)) void calculate()
  },
)
function apply(o: Order) {
  applying.value = o
  Object.keys(applyForm).forEach((k) => ((applyForm as any)[k] = ''))
}
async function send() {
  if (!applying.value) return
  if (['nickname', 'wechat', 'school', 'available_time'].some((k) => !(applyForm as any)[k].trim())) {
    ElMessage.warning('请填写昵称、微信、学校及可授课时间')
    return
  }
  submitting.value = true
  try {
    await submitApplication(applying.value, applyForm)
    applying.value = null
    ElMessage.success(
      DEMO ? '演示申请已保存到本次会话后台，刷新后清除。' : '申请已提交，管理员将通过微信联系你。',
    )
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <main class="visitor-layout" :class="{ collapsed }">
    <aside class="order-sidebar">
      <section class="sidebar-heading">
        <div>
          <span class="eyebrow">GUANGZHOU · TUTORING</span>
          <h1>找到适合你的学生单</h1>
          <p>选地点、选时间，找到刚刚好的那一单。</p>
        </div>
        <button class="icon-button" aria-label="收起侧栏" @click="collapsed = true">
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </section>
      <section class="filter-panel">
        <el-input
          v-model="filters.query"
          clearable
          placeholder="搜索编号、科目、小区或关键词"
          :prefix-icon="Search"
          aria-label="搜索订单"
        />
        <div class="filter-line">
          <span class="filter-label">单子类型</span>
          <div class="chip-group">
            <button
              v-for="t in TYPES"
              :key="t"
              :class="{ chosen: filters.types.includes(t) }"
              @click="flip(filters.types, t)"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div class="filter-line">
          <span class="filter-label">辅导科目</span>
          <div class="chip-group subject-chips">
            <button
              v-for="s in ['数学', '英语', '语文', '物理', '化学', '全科']"
              :key="s"
              :class="{ chosen: filters.subjects.includes(s) }"
              @click="flip(filters.subjects, s)"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <div class="filter-grid">
          <el-select v-model="filters.district" clearable placeholder="全部区域" aria-label="区域"
            ><el-option v-for="d in DISTRICTS" :key="d" :label="d" :value="d" /></el-select
          ><el-select v-model="filters.gender" clearable placeholder="老师性别不限" aria-label="老师性别"
            ><el-option label="女老师" value="女老师" /><el-option label="男老师" value="男老师" /></el-select
          ><el-select v-model="filters.day" clearable placeholder="星期不限" aria-label="授课星期"
            ><el-option v-for="(d, i) in DAYS" :key="d" :label="d" :value="i + 1" /></el-select
          ><el-select v-model="filters.period" clearable placeholder="时段不限" aria-label="授课时段"
            ><el-option v-for="p in PERIODS" :key="p" :label="p" :value="p" /></el-select
          ><el-select v-model="filters.price" aria-label="价格类型"
            ><el-option label="全部价格" value="all" /><el-option
              label="仅价格面议"
              value="negotiable" /><el-option label="仅明确时薪" value="numeric" /></el-select
          ><el-input-number
            v-model="filters.minPrice"
            :min="0"
            :controls="false"
            placeholder="最低时薪 ¥"
            aria-label="最低时薪"
          />
        </div>
        <div class="filter-bottom">
          <el-checkbox
            v-model="filters.favoritesOnly"
            @change="(v: boolean | string | number) => v && !isLoggedIn() && emit('login')"
            ><el-icon><Star /></el-icon>只看收藏</el-checkbox
          ><button class="text-button muted" @click="reset">
            <el-icon><Refresh /></el-icon>重置<span v-if="filterCount"> ({{ filterCount }})</span>
          </button>
        </div>
      </section>
      <div class="results-toolbar">
        <span
          >找到 <strong>{{ results.length }}</strong> 个单子</span
        ><el-select v-model="sort" class="sort-select" aria-label="排序"
          ><el-option label="最新发布" value="latest" /><el-option
            label="距离最近 · 公交通勤"
            value="commute" /><el-option label="价格从高到低" value="price"
        /></el-select>
      </div>
      <div v-if="store.error" class="inline-error">
        {{ store.error }} <button @click="loadOrders(filters.query)">重试</button>
      </div>
      <div class="order-list" v-loading="store.loading">
        <OrderCard
          v-for="o in results"
          :key="o.id"
          :order="o"
          :selected="selected === o.id"
          :favorite="store.favorites.includes(o.id)"
          @select="select"
          @favorite="favorite"
          @apply="apply"
          @wechat="emit('wechat')"
        /><el-empty
          v-if="!results.length && !store.loading"
          description="没有匹配的单子，试试放宽筛选条件"
          :image-size="80"
        />
      </div>
      <div class="sidebar-footnote">完整要求可展开查看 · 联系信息与门牌仅后台可见</div>
    </aside>
    <section class="map-section">
      <MapView
        :orders="markers"
        :selected="selected"
        :origin="origin"
        :picking="picking"
        @select="select"
        @pick="(p) => setOrigin(p, DEMO ? '示意出发点' : '地图所选出发点')"
      />
      <button v-if="collapsed" class="expand-sidebar" @click="collapsed = false">
        <el-icon><ArrowRight /></el-icon>展开单子列表
      </button>
      <div class="map-topbar">
        <div class="location-control">
          <button @click="originDialog = true">
            <el-icon><Location /></el-icon><span>{{ originLabel }}</span></button
          ><button class="locate-button" @click="locate" title="定位当前位置">定位</button>
        </div>
        <el-select
          v-model="filters.maxCommute"
          clearable
          :value-on-clear="null"
          placeholder="公交通勤不限"
          aria-label="通勤时间上限"
          ><el-option
            v-for="m in [30, 60, 90, 120, 150, 180]"
            :key="m"
            :label="`${m / 60}h 以内`"
            :value="m" /></el-select
        ><button class="map-action" @click="calculate" :disabled="busy">
          {{ busy ? '计算中…' : '查询通勤' }}
        </button>
      </div>
      <div class="map-info">
        <div>
          <span class="live-dot"></span><strong>广州家教地图</strong
          ><span>{{ markers.length }} 个可申请单子</span>
        </div>
        <p>标记仅到小区 / 街道附近，保护学生隐私</p>
        <small v-if="origin"
          >公交 / 地铁最快方案 · {{ nextDaytime().date }} 10:00 出发<br />1h
          以上显示约半小时档位，筛选仍按真实分钟</small
        >
      </div>
      <div class="map-legend">
        <span><i class="legend-price">¥</i>每小时时薪</span
        ><span><i class="legend-negotiable">●</i>价格面议</span><span>仅已上架单子显示在地图</span>
      </div>
    </section>
    <el-dialog v-model="originDialog" title="设置通勤出发点" width="440px" align-center
      ><p class="dialog-intro">从这里出发，按白天公交 / 地铁最快方案筛选。</p>
      <el-input v-model="originText" placeholder="例如：华南师范大学石牌校区" @keyup.enter="searchOrigin"
        ><template #append><el-button @click="searchOrigin">查找</el-button></template></el-input
      >
      <div class="dialog-actions">
        <el-button :icon="Location" @click="locate">定位当前位置</el-button
        ><el-button @click="pickOrigin">在地图选点</el-button>
      </div>
      <el-alert
        v-if="DEMO"
        type="info"
        title="将通过高德查询真实公交路线；演示学生资料不会写入真实数据库。"
        :closable="false"
    /></el-dialog>
    <el-dialog
      :model-value="!!applying"
      @update:model-value="(v: boolean) => !v && (applying = null)"
      :title="`申请单子 #${applying?.id || ''}`"
      width="480px"
      align-center
      ><p class="dialog-intro">无需注册。以下信息仅管理员可见，便于与你联系。</p>
      <el-form label-position="top" @submit.prevent="send"
        ><el-form-item label="昵称 *"><el-input v-model="applyForm.nickname" maxlength="40" /></el-form-item
        ><el-form-item label="微信 *"><el-input v-model="applyForm.wechat" maxlength="80" /></el-form-item
        ><el-form-item label="学校 *"><el-input v-model="applyForm.school" maxlength="100" /></el-form-item
        ><el-form-item label="可授课时间 *"
          ><el-input
            v-model="applyForm.available_time"
            maxlength="400"
            placeholder="例如：周六、周日下午" /></el-form-item
        ><el-form-item label="补充说明"
          ><el-input v-model="applyForm.note" type="textarea" :rows="3" maxlength="1500" /></el-form-item
        ><input
          v-model="applyForm.website"
          class="honeypot"
          tabindex="-1"
          autocomplete="off"
          aria-hidden="true"
        /><el-alert
          v-if="DEMO"
          type="warning"
          title="演示申请不会通知管理员，刷新页面即清除。"
          :closable="false"
        /><el-button
          class="full-width submit-button"
          type="primary"
          native-type="submit"
          :loading="submitting"
          >确认提交申请</el-button
        ></el-form
      ></el-dialog
    >
  </main>
</template>
