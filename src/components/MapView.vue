<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import type { Order } from '../../shared/domain'
import { DEMO } from '../services'
const props = defineProps<{
  orders: Order[]
  selected?: number
  origin?: [number, number] | null
  picking?: boolean
}>()
const emit = defineEmits<{ select: [id: number]; pick: [point: [number, number]] }>()
const container = ref<HTMLElement>(),
  ready = ref(false),
  error = ref(''),
  zoom = ref(1)
let map: any,
  markers: any[] = [],
  originMarker: any
const pins = computed(() => props.orders.filter((o) => o.lng !== null && o.lat !== null))
const pos = (o: Order) => ({
  left: `${Math.max(6, Math.min(94, 50 + (o.lng! - 113.33) * 200 * zoom.value))}%`,
  top: `${Math.max(8, Math.min(90, 48 - (o.lat! - 23.12) * 240 * zoom.value))}%`,
})
function redraw() {
  if (!map) return
  const AMap = (window as any).AMap
  map.remove(markers)
  markers = props.orders
    .filter((o) => o.lng !== null && o.lat !== null)
    .map((o) => {
      const el = document.createElement('button')
      el.className = `price-pin ${o.id === props.selected ? 'selected' : ''}`
      el.textContent = o.hourlyPrice === null ? '●' : `¥${o.hourlyPrice}`
      el.title = `#${o.id} ${o.title}`
      el.onclick = () => emit('select', o.id)
      return new AMap.Marker({ position: [o.lng, o.lat], content: el, anchor: 'bottom-center' })
    })
  map.add(markers)
  if (originMarker) map.remove(originMarker)
  if (props.origin) {
    originMarker = new AMap.Marker({
      position: props.origin,
      content: '<span class="origin-pin">出发点</span>',
      anchor: 'bottom-center',
    })
    map.add(originMarker)
  }
}
function fallbackPick(e: MouseEvent) {
  if (!props.picking || ready.value) return
  const r = container.value!.getBoundingClientRect()
  emit('pick', [
    113.33 + (((e.clientX - r.left) / r.width) * 100 - 50) / (200 * zoom.value),
    23.12 - (((e.clientY - r.top) / r.height) * 100 - 48) / (240 * zoom.value),
  ])
}
onMounted(async () => {
  const key = import.meta.env.VITE_AMAP_JS_KEY
  if (DEMO || !key) return
  try {
    const host =
      import.meta.env.VITE_AMAP_PROXY_URL ||
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/amap-proxy/_AMapService`
    ;(window as any)._AMapSecurityConfig = { serviceHost: host }
    if (!(window as any).AMap)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('高德地图未加载，请核对 Key、域名白名单及安全代理'))
        document.head.append(script)
      })
    map = new (window as any).AMap.Map(container.value, {
      center: [113.33, 23.12],
      zoom: 11,
      viewMode: '2D',
      mapStyle: 'amap://styles/normal',
    })
    map.on('click', (e: any) => {
      if (props.picking) emit('pick', [e.lnglat.lng, e.lnglat.lat])
    })
    ready.value = true
    redraw()
  } catch (e) {
    error.value = (e as Error).message
  }
})
watch(() => [props.orders, props.selected, props.origin], redraw, { deep: true })
watch(
  () => props.selected,
  (id) => {
    const o = props.orders.find((x) => x.id === id)
    if (map && o?.lng && o.lat) map.panTo([o.lng, o.lat])
  },
)
onBeforeUnmount(() => map?.destroy())
</script>
<template>
  <div class="map-view" :class="{ 'pick-mode': picking }" ref="container" @click="fallbackPick">
    <template v-if="!ready">
      <div class="map-illustration">
        <svg viewBox="0 0 1000 800" preserveAspectRatio="none">
          <defs>
            <pattern id="blocks" width="110" height="90" patternUnits="userSpaceOnUse">
              <rect width="110" height="90" fill="#eef1e9" />
              <path d="M0 0H110V90H0Z M30 0V90 M0 35H110" stroke="#fff" stroke-width="8" fill="none" />
              <rect x="43" y="46" width="45" height="25" rx="5" fill="#e2e9dc" />
            </pattern>
          </defs>
          <rect width="1000" height="800" fill="url(#blocks)" />
          <path
            d="M-50 460C180 340 230 560 460 480S740 260 1040 405"
            stroke="#bedeea"
            stroke-width="75"
            fill="none"
          />
          <g fill="none" stroke="#fff" stroke-width="13">
            <path d="M0 130L1000 270 M70 0L590 800 M560 0L800 800 M0 690L1000 130" />
          </g>
          <g stroke="#f4d599" stroke-width="4" fill="none">
            <path d="M0 130L1000 270 M70 0L590 800 M560 0L800 800 M0 690L1000 130" />
          </g></svg
        ><span class="district-label d-tianhe">天河区</span><span class="district-label d-haizhu">海珠区</span
        ><span class="district-label d-yuexiu">越秀区</span><span class="district-label d-panyu">番禺区</span
        ><span class="river-label">珠 江</span>
      </div>
      <button
        v-for="o in pins"
        :key="o.id"
        class="price-pin demo-pin"
        :class="{ selected: o.id === selected }"
        :style="pos(o)"
        :title="`#${o.id} ${o.title}`"
        @click.stop="emit('select', o.id)"
      >
        {{ o.hourlyPrice === null ? '●' : `¥${o.hourlyPrice}` }}
      </button>
      <div class="map-notice">
        <span class="live-dot"></span
        >{{ error || (DEMO ? '地图示意 · 测试资料，非真实订单' : '高德地图待配置 · 当前为示意图') }}
      </div>
    </template>
    <div class="map-zoom">
      <button aria-label="放大地图" @click.stop="map ? map.zoomIn() : (zoom = Math.min(zoom + 0.2, 2))">
        ＋</button
      ><button aria-label="缩小地图" @click.stop="map ? map.zoomOut() : (zoom = Math.max(zoom - 0.2, 0.5))">
        −
      </button>
    </div>
    <div v-if="picking" class="pick-notice">点击地图选择位置（请勿标记具体门牌）</div>
    <span class="map-attribution">{{ ready ? '高德地图' : '广州布局示意，不用于导航' }}</span>
  </div>
</template>
