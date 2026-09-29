<script setup lang="ts">
import { ref, onMounted, computed, watch, defineAsyncComponent } from 'vue'
import { MapLocation, ArrowRight, Setting, User, SwitchButton } from '@element-plus/icons-vue'
import VisitorPage from './components/VisitorPage.vue'
const AdminPage = defineAsyncComponent(() => import('./components/AdminPage.vue'))
import AuthDialog from './components/AuthDialog.vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { init, store, DEMO, isLoggedIn, logout } from './services'

const page = ref(location.hash.startsWith('#admin') ? 'admin' : 'map'),
  authOpen = ref(false),
  qrOpen = ref(false)
const baseURL = import.meta.env.BASE_URL
const account = computed(() => store.session?.user.email || (store.demoUser ? '演示账号' : ''))
watch(
  () => store.passwordSetup,
  (value) => {
    if (value) authOpen.value = true
  },
)
function navigate(value: string) {
  page.value = value
  location.hash = value === 'admin' ? 'admin' : 'map'
}
onMounted(() => {
  void init().catch((e) => {
    store.error = e instanceof Error ? e.message : '连接后台失败'
  })
  window.addEventListener(
    'hashchange',
    () => (page.value = location.hash.startsWith('#admin') ? 'admin' : 'map'),
  )
})
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" href="#map" @click="navigate('map')"
          ><span class="brand-symbol"
            ><el-icon><MapLocation /></el-icon></span
          ><span
            ><strong>广州家教地图<span class="brand-suffix">-edus</span></strong
            ><small>让合适的家教单，就在你附近</small></span
          ></a
        >
        <nav class="top-nav">
          <button :class="{ active: page === 'map' }" @click="navigate('map')">找家教单</button
          ><button :class="{ active: page === 'admin' }" @click="navigate('admin')">
            <el-icon><Setting /></el-icon>管理后台
          </button>
        </nav>
        <div class="header-actions">
          <span v-if="DEMO" class="demo-label">首版演示</span
          ><button class="text-button qr-header" @click="qrOpen = true">
            联系微信 <el-icon><ArrowRight /></el-icon></button
          ><button v-if="!isLoggedIn()" class="account-button" @click="authOpen = true">
            <el-icon><User /></el-icon>登录 / 注册</button
          ><button v-else class="text-button" :title="account" @click="logout()">
            <el-icon><SwitchButton /></el-icon>退出登录
          </button>
        </div>
      </header>
      <VisitorPage v-if="page === 'map'" @login="authOpen = true" @wechat="qrOpen = true" />
      <AdminPage v-else @login="authOpen = true" />
      <AuthDialog v-model="authOpen" />
      <el-dialog v-model="qrOpen" title="微信联系" width="360px" align-center
        ><div class="qr-content">
          <img :src="`${baseURL}qrcode.png`" alt="全站联系微信二维码" /><strong>扫码添加微信</strong>
          <p>联系时请说明感兴趣的单子编号。<br />这里是管理员的统一联系微信。</p>
        </div></el-dialog
      >
    </div>
  </el-config-provider>
</template>
