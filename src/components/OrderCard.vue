<script setup lang="ts">
import { ref } from 'vue'
import {
  Location,
  Clock,
  Star,
  StarFilled,
  ArrowDown,
  ArrowUp,
  Right,
  Reading,
} from '@element-plus/icons-vue'
import { priceLabel, commuteLabel, type Order } from '../../shared/domain'
defineProps<{ order: Order; selected: boolean; favorite: boolean }>()
const emit = defineEmits(['select', 'favorite', 'apply', 'wechat'])
const expanded = ref(false)
</script>
<template>
  <article
    :id="`order-${order.id}`"
    class="order-card"
    :class="{ selected, accepted: order.status === '已接单' }"
    @click="emit('select', order.id)"
  >
    <div class="card-top">
      <div class="card-tags">
        <span class="order-id">#{{ order.id }}</span
        ><span
          v-for="type in order.types"
          :key="type"
          class="type-tag"
          :class="type === '暑假单' ? 'summer' : type === '寒假单' ? 'winter' : 'long'"
          >{{ type }}</span
        ><span v-if="!order.types.length" class="type-tag">待分类</span>
      </div>
      <button
        class="favorite-button"
        :class="{ saved: favorite }"
        :aria-label="favorite ? '取消收藏' : '收藏单子'"
        @click.stop="emit('favorite', order.id)"
      >
        <el-icon><StarFilled v-if="favorite" /><Star v-else /></el-icon>
      </button>
    </div>
    <div class="card-title-row">
      <h3>{{ order.title }}</h3>
      <span class="status-dot" :class="order.status === '已接单' ? 'taken' : 'live'">{{ order.status }}</span>
    </div>
    <div class="card-price" :class="{ negotiable: order.hourlyPrice === null }">
      <strong>{{
        order.hourlyPrice === null
          ? '价格面议'
          : `${order.priceEstimated ? '约 ' : ''}${order.hourlyPrice}${order.hourlyMax !== null && order.hourlyMax !== order.hourlyPrice ? '–' + order.hourlyMax : ''}`
      }}</strong
      ><span v-if="order.hourlyPrice !== null">元 / 小时</span
      ><small v-if="order.priceEstimated">按每次 2h 估算</small
      ><small v-else-if="order.negotiable && order.hourlyPrice !== null">可协商</small>
    </div>
    <p class="card-detail">
      <el-icon><Location /></el-icon>{{ order.address
      }}<small v-if="order.locationQuality === '区域中心'">位置待确认</small>
    </p>
    <p class="card-detail">
      <el-icon><Clock /></el-icon><span>{{ order.scheduleText || '具体时间协商' }}</span>
    </p>
    <div class="card-bottom">
      <span class="teacher-meta"
        ><el-icon><Reading /></el-icon>{{ order.teacherGender
        }}<span v-if="order.slots.some((s) => s.flexible)" class="flexible-label">时间待确认</span></span
      ><span
        v-if="order.commuteMinutes != null"
        class="commute-label"
        :title="`高德参考 ${Math.ceil(order.commuteMinutes)} 分钟；白天10:00出发`"
        >{{ commuteLabel(order.commuteMinutes) }}</span
      ><button class="expand-button" @click.stop="expanded = !expanded">
        {{ expanded ? '收起' : '详情' }}<el-icon><ArrowUp v-if="expanded" /><ArrowDown v-else /></el-icon>
      </button>
    </div>
    <div v-if="expanded" class="card-expanded">
      <section>
        <h4>老师要求</h4>
        <p>{{ order.requirements || '暂无补充要求，可联系管理员了解。' }}</p>
      </section>
      <section v-if="order.studentInfo">
        <h4>学生情况</h4>
        <p>{{ order.studentInfo }}</p>
      </section>
      <p class="privacy-note">仅公开近似位置；姓名、联系方式和详细门牌不展示。</p>
      <div class="card-actions">
        <el-button type="primary" :disabled="order.status !== '已上架'" @click.stop="emit('apply', order)"
          >{{ order.status === '已上架' ? '申请这个单子' : '已接单 · 不可申请'
          }}<el-icon><Right /></el-icon></el-button
        ><el-button @click.stop="emit('wechat')">微信联系</el-button>
      </div>
    </div>
  </article>
</template>
