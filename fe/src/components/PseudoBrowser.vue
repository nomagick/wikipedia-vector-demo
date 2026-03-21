<template>
  <!-- Outer q-card mimicking Safari browser window -->
  <q-card class="safari-window">
    <!-- Safari window header with traffic light buttons -->
    <div class="safari-header">
      <div class="traffic-lights">
        <div class="traffic-light red"></div>
        <div class="traffic-light yellow"></div>
        <div class="traffic-light green"></div>
      </div>

      <!-- Safari toolbar with navigation and address bar -->
      <div class="safari-toolbar">
        <div class="navigation-buttons">
          <q-btn round flat dense icon="arrow_back" color="black" size="sm" @click="$emit('doBack')"/>
          <q-btn round flat dense icon="arrow_forward" color="black" size="sm" @click="$emit('doForward')"/>
          <q-btn round flat dense icon="refresh" color="black" size="sm" @click="$emit('doRefresh')"/>
        </div>

        <!-- Address bar with fixed URL -->
        <div class="address-bar relative-position">
          <div class="address-bar-inner">
            <q-icon name="lock" size="xs" color="black" class="q-mr-xs"/>
            <span class="url-text">{{props.href || ''}}</span>
          </div>
          <q-linear-progress v-if="props.isLoading" indeterminate size="2px" color="blue" class="safari-progress"/>
        </div>

        <div class="safari-actions">
          <q-btn round flat dense icon="add" color="black" size="sm"/>
          <q-btn round flat dense icon="more_horiz" color="black" size="sm"/>
        </div>
      </div>
    </div>

    <!-- Browser content area -->
    <q-card-section class="browser-content q-pa-none">
      <!-- Show 404 page if domain is jinaai.cn -->
      <div v-if="props.results === null" class="fake-404-container">
        <div class="fake-404">
          <div class="fake-404-icon">
            <q-icon name="error_outline" size="4rem" color="red" />
          </div>
          <h2 class="fake-404-title">404. That's an error.</h2>
          <p class="fake-404-message">The requested URL was not found on this server. That's all we know.</p>
        </div>
      </div>

      <!-- Inner q-card for Google-like SERP -->
      <q-card v-else flat class="serp-container">
        <!-- Header section with logo and search box -->
        <q-card-section class="serp-header">
          <div class="logo-section">
            <div class="logo">
              <slot name="logo">
                <!-- Default logo content if no slot provided -->
                <span class="blue">V</span><span class="red">I</span><span class="yellow">B</span><span
                class="green">E</span><span class="blue">SEARCH</span>
              </slot>
            </div>
          </div>
          <div class="search-box-section">
            <div class="search-box">
              <q-input
                v-model="searchQuery"
                outlined
                dense
                bg-color="white"
                class="google-search-input"
                @keyup.enter="onSend"
                ref="searchInput"
                borderless
              >
                <template v-slot:prepend>
                  <q-icon name="search" size="sm" color="black"/>
                </template>
                <template v-slot:append>
                  <q-icon v-if="props.query && !props.isLoading" name="clear" class="cursor-pointer" color="black"
                          @click="clearSearch"/>
                  <q-icon v-if="props.isLoading" name="sync" class="loading-icon" color="black"/>
                  <q-icon name="mic" color="blue" class="q-ml-xs"/>
                </template>
              </q-input>
            </div>
          </div>
        </q-card-section>

        <!-- Navigation tabs similar to Google -->
        <div class="tab-container">
          <div class="serp-tabs">
            <div class="tab active">
              <q-icon name="search" size="sm"/>
              <span>ALL</span>
            </div>
            <div class="tab">
              <q-icon name="image" size="sm"/>
              <span>IMAGES</span>
            </div>
            <div class="tab">
              <q-icon name="videocam" size="sm"/>
              <span>VIDEOS</span>
            </div>
            <div class="tab">
              <q-icon name="shopping_cart" size="sm"/>
              <span>SHOPPING</span>
            </div>
            <div class="tab right-tab">
              <span>TOOLS</span>
            </div>
          </div>
          <q-separator/>
        </div>

        <!-- Search results section -->
        <div class="serp-results-container" v-if="props.results && props.results.length">
          <div class="results-stats" v-if="props.totalResults && props.searchTime">
            About {{ props.totalResults }} results ({{ props.searchTime }} seconds)
          </div>

          <div class="result-item" v-for="(result, index) in props.results" :key="index">
            <div class="flex items-center q-mb-xs">
              <img :src="`https://www.google.com/s2/favicons?domain=${getDomainHostname(result.link)}&sz=16`" class="favicon"/>
              <span class="domain-text">{{ result.domain }}</span>
            </div>
            <a :href="result.link" class="result-title" v-html="result.title" target="_blank"></a>
            <div class="result-snippet" v-html="result.snippet" @click="emit('doNavigate', result)"></div>
            <div class="result-tags q-gutter-sm" v-if="result.tags && result.tags.length">
              <q-badge outline color="blue-grey-7" class="result-tag" v-for="(tag, tagIndex) in result.tags" :key="tagIndex" :label="tag" @click="emit('doNavigate', result, tag)" />
            </div>
          </div>

          <!-- Pagination -->
          <div class="pagination-container">
            <div class="text-center">
              <div class="logo-pagination">
                <slot name="logo">
                  <!-- Default logo content if no slot provided -->
                  <span class="blue">V</span><span class="red">I</span><span class="yellow">B</span><span
                  class="green">E</span><span class="blue">SEARCH</span>
                </slot>
              </div>
              <div :class="`page-numbers ${props.totalPages && props.totalPages > 1 ? '' : 'disabled'}`">
                <div
                  v-for="pageNum in 10"
                  :key="pageNum"
                  class="page"
                  :class="{ active: currentPage === pageNum }"
                  @click="changePage(pageNum)"
                >
                  {{ pageNum }}
                </div>
                <div class="page next" @click="changePage(currentPage + 1)" v-if="currentPage < 10">
                  <q-icon name="navigate_next"/>
                </div>
              </div>
            </div>
          </div>
        </div>
      </q-card>
    </q-card-section>
  </q-card>
</template>

<script lang="ts" setup>
import {ref, onMounted, computed, defineEmits, defineProps, watch} from 'vue';
import { useQuasar } from 'quasar';
// import {useI18n} from 'vue-i18n';

// Type definition for search results
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  tags?: string[];
  domain?: string;
}

const emit = defineEmits(['doSearch', 'doNavigate', 'clearSearch', 'doBack', 'doForward', 'doRefresh']);

const props = defineProps<{
  isLoading?: boolean;
  query?: string;
  totalPages?: number;
  pageNumber?: number;
  results?: SearchResult[];
  href?: string;
  totalResults?: number;
  searchTime?: number;
}>();

// const { t } = useI18n({ useScope: 'global' });
const t = (key: string) => key; // Placeholder translation function
const $q = useQuasar();
// Reference to the search input element
const searchInput = ref<HTMLInputElement | null>(null);
const BASE_URL = 'https://llm-serp.jina.ai';

// Reactive state variables
const searchQuery = ref(props.query);
const searchResults = ref<SearchResult[]>([]);
const isLoading = ref(true);
const resultStats = ref({
  totalResults: '12',
  searchTime: '0.41'
});
const currentPage = ref(1);
const showFake404 = ref(false);

watch(props, (newProps) => {
  if (newProps.query !== searchQuery.value) {
    searchQuery.value = newProps.query || '';
  }
});

// Check if the domain should show a 404 error
const shouldShow404 = (query: string) => {
  // Check if the query contains any .cn domain or specifically jinaai.cn
  return /jinaai\.cn|\.cn\b/.test(query.toLowerCase());
};

// Method to handle page change
const changePage = (page: number) => {
  if (page < 1 || page > 10 || page === currentPage.value) return;

  emit('doSearch', searchQuery.value, page);

  // Scroll to top of results
  const resultsContainer = document.querySelector('.serp-results-container');
  if (resultsContainer) {
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
  }
};

const onSend = () => {
  if (!searchQuery.value) return;

  // Reset to page 1 when performing a new search
  currentPage.value = 1;
  emit('doSearch', searchQuery.value);
};

// Method to clear the search box
const clearSearch = () => {
  searchQuery.value = '';
  if (searchInput.value) {
    searchInput.value.focus();
  }
  emit('clearSearch');
};

const getDomainHostname = (url: string) => {
  try {
    const a = document.createElement('a');
    a.href = url;
    return a.hostname;
  } catch (e) {
    return new URL(url).hostname;
  }
};



// Set up component on mount
onMounted(() => {
  // Focus on the search input when component is mounted
  if (searchInput.value) {
    searchInput.value.focus();
  }

});
</script>

<style scoped>
/* Safari browser window styling */
.safari-window {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.safari-header {
  background: linear-gradient(to bottom, #f6f6f6, #e8e8e8);
  padding: 8px 12px;
}

.traffic-lights {
  display: flex;
  margin-bottom: 10px;
}

.traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
  box-shadow: inset 0 0 1px rgba(0, 0, 0, 0.3);
}

.traffic-light.red {
  background-color: #ff5f57;
}

.traffic-light.yellow {
  background-color: #ffbd2e;
}

.traffic-light.green {
  background-color: #28c941;
}

.safari-toolbar {
  display: flex;
  align-items: center;
}

.navigation-buttons {
  display: flex;
  margin-right: 10px;
}

.address-bar {
  flex: 1;
  background-color: white;
  border-radius: 5px;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.1);
}

.address-bar-inner {
  display: flex;
  align-items: center;
  width: 100%;
}

.url-text {
  font-size: 13px;
  color: #4d4d4d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.safari-actions {
  display: flex;
  margin-left: 10px;
}

.safari-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.browser-content {
  background-color: #f2f2f2;
  height: calc(100vh - 200px);
  min-height: 500px;
  overflow-y: auto;
}

/* SERP styling */
.serp-container {
  background-color: white;
  min-height: 100%;
}

.serp-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20px;
  padding-bottom: 25px;
}

.logo-section {
  margin-bottom: 25px;
}

.logo {
  font-size: 28px;
  font-weight: bold;
  letter-spacing: -1px;
}

.search-box-section {
  width: 100%;
  max-width: 584px;
}

.search-box {
  width: 100%;
}

.google-search-input {
  border-radius: 24px;
  box-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
}

.google-search-input :deep(.q-field__control) {
  border-radius: 24px;
  box-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
  height: 44px;
}

.google-search-input :deep(.q-field__control):hover {
  box-shadow: 0 1px 6px rgba(32, 33, 36, 0.35);
}

.google-search-input :deep(.q-field__control--focused) {
  box-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
  border: 1px solid rgba(223, 225, 229, 0);
}

.google-search-input :deep(.q-field__native) {
  color: #202124;
  font-size: 16px;
  background-color: transparent;
  padding-left: 5px;
}

.blue {
  color: #4285F4;
}

.red {
  color: #EA4335;
}

.yellow {
  color: #FBBC05;
}

.green {
  color: #34A853;
}

.tab-container {
  border-bottom: 1px solid #ebebeb;
}

.serp-tabs {
  display: flex;
  max-width: 100%;
  margin-left: 170px;
  font-size: 13px;
  color: #5f6368;
  height: 48px;
  align-items: center;
  position: relative;
}

.tab {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 48px;
  cursor: pointer;
}

.tab span {
  margin-left: 5px;
  font-size: 13px;
  text-transform: uppercase;
}

.tab.active {
  color: #1a73e8;
  border-bottom: 3px solid #1a73e8;
  font-weight: 500;
}

.tab.right-tab {
  position: absolute;
  right: 20px;
}

/* Result styles */
.serp-results-container {
  max-width: 652px;
  margin-left: 170px;
  padding-top: 15px;
  padding-bottom: 40px;
}

.results-stats {
  font-size: 14px;
  color: #70757a;
  margin-bottom: 20px;
}

.result-item {
  margin-bottom: 28px;
}

.domain-text {
  font-size: 14px;
  color: #5f6368;
}

.favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.result-title {
  display: block;
  font-size: 20px;
  color: #1a0dab;
  text-decoration: none;
  margin-bottom: 5px;
  line-height: 1.3;
  font-weight: normal;
  cursor: alias;
}

.result-title:hover {
  text-decoration: underline;
}

.result-snippet {
  font-size: 14px;
  line-height: 1.58;
  color: #4d5156;
  cursor: pointer;
}

.result-tag {
  cursor: pointer;
}

/* Pagination */
.pagination-container {
  margin-top: 40px;
}

.logo-pagination {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 20px;
  letter-spacing: -1px;
}

.page-numbers {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.page {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1a0dab;
  font-size: 14px;
}

.page.active {
  color: #000;
}

.page:hover:not(.active) {
  text-decoration: underline;
}

.page.next {
  color: #1a0dab;
}

.loading-icon {
  animation: rotate 1s infinite linear;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 404 page */
.fake-404-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  background-color: white;
}

.fake-404 {
  text-align: center;
  padding: 40px;
  max-width: 600px;
}

.fake-404-icon {
  margin-bottom: 20px;
}

.fake-404-title {
  font-size: 24px;
  color: #5f6368;
  margin-bottom: 16px;
  font-weight: 500;
}

.fake-404-message {
  font-size: 16px;
  color: #5f6368;
}

/* Make responsive */
@media (max-width: 768px) {
  .serp-tabs {
    margin-left: 10px;
    overflow-x: auto;
  }

  .serp-results-container {
    margin-left: 10px;
    margin-right: 10px;
  }
}
</style>
