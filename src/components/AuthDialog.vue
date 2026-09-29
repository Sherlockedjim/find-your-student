<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DEMO, store, supabase, siteURL } from '../services'
const open = defineModel<boolean>({ default: false })
const mode = ref('login'),
  email = ref(''),
  password = ref(''),
  loading = ref(false)
watch(
  () => store.passwordSetup,
  (value) => {
    if (value) mode.value = 'setup'
  },
)
async function submit() {
  if (DEMO) return ElMessage.info('演示模式请使用下方演示账号；真实登录需切换正式模式。')
  if (!supabase) return ElMessage.error('请先配置 Supabase')
  if (mode.value !== 'setup' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value))
    return ElMessage.warning('请输入有效邮箱')
  if (mode.value !== 'reset' && password.value.length < 8) return ElMessage.warning('密码至少8位')
  loading.value = true
  try {
    const r =
      mode.value === 'setup'
        ? await supabase.auth.updateUser({ password: password.value })
        : mode.value === 'register'
          ? await supabase.auth.signUp({
              email: email.value,
              password: password.value,
              options: { emailRedirectTo: siteURL() },
            })
          : mode.value === 'reset'
            ? await supabase.auth.resetPasswordForEmail(email.value, { redirectTo: siteURL() + '#reset' })
            : await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
    if (r.error) throw r.error
    ElMessage.success(
      mode.value === 'setup' ? '密码已设置' : mode.value === 'login' ? '登录成功' : '请检查邮箱完成操作',
    )
    store.passwordSetup = false
    open.value = false
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    loading.value = false
  }
}
function demoLogin() {
  store.demoUser = true
  open.value = false
  ElMessage.info('已进入演示账号：不会注册、发送邮件或保存到真实后台')
}
</script>
<template>
  <el-dialog
    v-model="open"
    :title="
      mode === 'setup'
        ? '设置账号密码'
        : mode === 'register'
          ? '注册收藏账号'
          : mode === 'reset'
            ? '找回密码'
            : '欢迎回来'
    "
    width="420px"
    align-center
    ><p class="dialog-subtitle">
      {{
        mode === 'setup'
          ? '邀请或密码重置验证已完成，请设置至少8位的新密码。'
          : '浏览和申请无需登录；收藏需要邮箱账号。'
      }}
    </p>
    <el-alert
      v-if="DEMO"
      title="当前是演示模式，真实登录需完成后台配置。"
      type="info"
      :closable="false"
    /><el-form label-position="top" @submit.prevent="submit"
      ><el-form-item v-if="mode !== 'setup'" label="邮箱"
        ><el-input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="你的邮箱地址" /></el-form-item
      ><el-form-item v-if="mode !== 'reset'" label="密码"
        ><el-input
          v-model="password"
          type="password"
          show-password
          :autocomplete="mode === 'setup' ? 'new-password' : 'current-password'"
          placeholder="至少8位" /></el-form-item
      ><el-button type="primary" native-type="submit" :loading="loading" class="full-width">{{
        mode === 'setup'
          ? '确认设置密码'
          : mode === 'register'
            ? '注册账号'
            : mode === 'reset'
              ? '发送重置邮件'
              : '登录'
      }}</el-button></el-form
    >
    <div v-if="mode !== 'setup'" class="auth-links">
      <button @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === 'login' ? '没有账号？注册' : '返回登录' }}</button
      ><button @click="mode = 'reset'">忘记密码</button>
    </div>
    <el-button v-if="DEMO" class="full-width" @click="demoLogin"
      >使用演示账号体验收藏（不注册）</el-button
    ></el-dialog
  >
</template>
