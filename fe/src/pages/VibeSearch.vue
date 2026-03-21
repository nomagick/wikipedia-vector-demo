<template>
  <q-page>
    <div class="row justify-center items-center" style="padding-top: 80px">
      <PseudoBrowser :results="results" :isLoading="isLoading" @doSearch="onDoSearchEvent" :query="searchQuery"
        @doBack="goBack" @doForward="goForward" @doRefresh="doRandomSearch"
        @clearSearch="onClearSearch" @doNavigate="onDoNavigateEvent" :totalResults="totalCount" :searchTime="searchTime"
        :href="navigationBar">

        <template v-slot:logo>
          <img src="https://en.wikipedia.org/static/images/mobile/copyright/wikipedia-wordmark-en-25.svg" alt=""
            width="177">

        </template>

      </PseudoBrowser>
    </div>

    <q-page-sticky position="bottom-right" :offset="fabPos">
      <q-fab v-model="fabOpen" label="Options" external-label vertical-actions-align="left" color="purple"
        icon="keyboard_arrow_up" direction="up" v-touch-pan.prevent.mouse="moveFab">
        <q-fab-action external-label color="primary" @click.stop.capture="toggleIndex" icon="manage_search"
          :label="`Index: ${retrievalIndex}`" />
        <q-fab-action external-label color="secondary" @click.stop.capture="useHybrid = !useHybrid" icon="ssid_chart"
          :label="`Hybrid: ${useHybrid ? 'on' : 'off'}`" />
        <q-fab-action external-label color="cyan" @click.stop.capture="useReranker = !useReranker" icon="auto_mode"
          :label="`Rerank: ${useReranker ? 'on' : 'off'}`" />
        <q-fab-action external-label color="grey" @click.stop.capture="toggleClassificationSystem" icon="book"
          :label="`Classification: ${classificationSystem}`" />
      </q-fab>
    </q-page-sticky>

  </q-page>
</template>
<script setup lang="ts">
import PseudoBrowser, { SearchResult } from 'components/PseudoBrowser.vue';
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
// import {useI18n} from 'vue-i18n';
// import {useMetaTags} from 'src/composables/useMetaTags';

// const {t, te} = useI18n({useScope: 'global'});

const fabOpen = ref(false);
const retrievalIndex = ref('disk_bbq');
const useHybrid = ref(false);
const useReranker = ref(false);
const classificationSystem = ref('ddc');
const navigationBar = ref('');
const searchQuery = ref('');

const toggleIndex = () => {
  retrievalIndex.value = retrievalIndex.value === 'disk_bbq' ? 'hnsw_int8' : 'disk_bbq';
};
const toggleClassificationSystem = () => {
  classificationSystem.value = classificationSystem.value === 'ddc' ? 'udc' : 'ddc';
};

const fabPos = ref([128, 128]);
const draggingFab = ref(false);
const moveFab = (ev: any) => {
  draggingFab.value = ev.isFirst !== true && ev.isFinal !== true;

  fabPos.value = [
    fabPos.value[0] - ev.delta.x,
    fabPos.value[1] - ev.delta.y
  ];
};

const t = (key: string) => key; // Placeholder translation function
const $q = useQuasar();
const adaptiveSize = computed(() => {
  switch ($q.screen.name) {
    case 'xl':
      return 'lg';
    case 'lg':
      return 'lg';
    case 'md':
      return 'md';
    case 'sm':
      return 'md';
    case 'xs':
      return 'md';
    default:
      return 'sm';
  }
});

const topCountries = [
  'United States', 'China', 'Germany', 'India', 'Japan', 'United Kingdom', 'France', 'Italy', 'Russia', 'Canada', 'Brazil', 'Spain', 'Mexico', 'Australia', 'South Korea', 'Turkey', 'Indonesia', 'Netherlands', 'Saudi Arabia', 'Poland', 'Switzerland', 'Taiwan', 'Belgium', 'Ireland', 'Sweden', 'Argentina', 'Israel', 'Singapore', 'Austria', 'United Arab Emirates', 'Thailand', 'Norway', 'Philippines', 'Bangladesh', 'Vietnam', 'Malaysia', 'Denmark', 'Colombia', 'Hong Kong', 'Romania', 'South Africa', 'Czech Republic', 'Pakistan', 'Egypt', 'Iran', 'Portugal', 'Chile', 'Finland', 'Nigeria', 'Peru', 'Kazakhstan', 'Greece', 'Algeria', 'New Zealand', 'Iraq', 'Hungary', 'Cuba', 'Qatar', 'Ukraine', 'Morocco', 'Slovakia', 'Kuwait', 'Uzbekistan',
];

const topicPrompts = [
  'getting a job in',
  'starting a business in',
  'medical care in',
  'demography landscape of',
  'political system of',
  'education system in',
  'military capabilities of',
  'cultural heritage of',
  'top scholars from',
  'local birds in',
  'traditional food in',
  'popular tourist attractions in',
  'famous historical events in',
  'native plants in',
  'cultural festivals in',
  'endangered species in',
  'economics in',
  'foundations of modern',
  'absurd events in',
];

setTimeout(() => {
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const index = params.get('index');
    const hybrid = params.get('hybrid') === '1';
    const rerank = params.get('rerank') === '1';
    const classificationSystemParam = params.get('classificationSystem');

    const search = params.get('search') || '';
    if (search) {
      retrievalIndex.value = index || retrievalIndex.value;
      useHybrid.value = hybrid;
      useReranker.value = rerank;
      classificationSystem.value = classificationSystemParam === 'udc' ? 'udc' : 'ddc';
      doSearch(search);
      navigationBar.value = `${getOpts()} Query: ${search}`;
      searchQuery.value = search;
      return;
    }
    const match = params.get('match') || '';
    if (match) {
      retrievalIndex.value = index || retrievalIndex.value;
      useHybrid.value = hybrid;
      useReranker.value = rerank;
      classificationSystem.value = classificationSystemParam === 'udc' ? 'udc' : 'ddc';
      doMatch(match);
      navigationBar.value = `${getOpts()} Match: ${match}`;
      searchQuery.value = '';
      return;
    }
    const classify = params.get('classify') || '';
    if (classify) {
      retrievalIndex.value = index || retrievalIndex.value;
      useHybrid.value = hybrid;
      useReranker.value = rerank;
      classificationSystem.value = classificationSystemParam === 'udc' ? 'udc' : 'ddc';
      doClassify(classify);
      navigationBar.value = `${getOpts()} Classify: ${classify}`;
      searchQuery.value = '';
      return;
    }
  }
  doRandomSearch();
});

function doRandomSearch() {
  const randomCountry = topCountries[Math.floor(Math.random() * topCountries.length)] as string;
  const randomTopic = topicPrompts[Math.floor(Math.random() * topicPrompts.length)] as string;
  const query = `${randomTopic} ${randomCountry}`;
  doSearch(query);
  navigationBar.value = `${getOpts()} Query: ${query}`;
  searchQuery.value = query;
}

function goBack() {
  window.history.back();
}
function goForward() {
  window.history.forward();
}

const results = ref<SearchResult[]>([]);
const totalCount = ref(0);
const searchTime = ref(0);

const isLoading = ref(false);

const SERVER = process.env.DEBUGGING ? 'http://localhost:3001' : ''; // Replace with your actual server URL

const dcCategoriesMap = new Map();
const urlItemMap = new Map();

let lastState: {
  query: string;
  index: string;
  hybrid: boolean;
  rerank: boolean;
  classificationSystem: string;
  type: 'search' | 'match' | 'classify' | string;
} | null = null;

function onNewAction(action: string, query: string) {
  lastState = {
    query,
    index: retrievalIndex.value,
    hybrid: useHybrid.value,
    rerank: useReranker.value,
    classificationSystem: classificationSystem.value,
    type: action,
  };
  history.pushState(lastState, '', `?${action}=${encodeURIComponent(query)}&index=${retrievalIndex.value}&hybrid=${useHybrid.value ? '1' : '0'}&rerank=${useReranker.value ? '1' : '0'}&classificationSystem=${classificationSystem.value}`);
}

function getOpts() {
  return `[Index: ${retrievalIndex.value}][Hybrid: ${useHybrid.value ? 'Y' : 'N'}][Rerank: ${useReranker.value ? 'Y' : 'N'}]`;
}

function doRefresh() {
  if (!lastState) {
    return;
  }
  switch (lastState.type) {
    case 'search':
      doSearch(lastState.query, 'popstate');
      navigationBar.value = `${getOpts()} Query: ${lastState.query}`;
      break;
    case 'match':
      doMatch(lastState.query, 'popstate');
      navigationBar.value = `${getOpts()} Match: ${lastState.query}`;
      break;
    case 'classify':
      doClassify(lastState.query, 'popstate');
      navigationBar.value = `${getOpts()} Classify: ${lastState.query}`;
      break;
  }
}

window.addEventListener('popstate', (event: any) => {
  const state = event.state;
  console.log('popstate event:', state);

  if (!state.type) {
    return;
  }

  retrievalIndex.value = state.index;
  useHybrid.value = state.hybrid;
  useReranker.value = state.rerank;
  classificationSystem.value = state.classificationSystem;
  lastState = state;
  doRefresh();
});

watch([retrievalIndex, useHybrid, useReranker, classificationSystem], () => {
  doRefresh();
  if (lastState) {

    lastState = {
      query: lastState.query,
      index: retrievalIndex.value,
      hybrid: useHybrid.value,
      rerank: useReranker.value,
      classificationSystem: classificationSystem.value,
      type: lastState.type,
    };
    history.pushState(lastState, '', `?${lastState.type}=${encodeURIComponent(lastState.query)}&index=${retrievalIndex.value}&hybrid=${useHybrid.value ? '1' : '0'}&rerank=${useReranker.value ? '1' : '0'}&classificationSystem=${classificationSystem.value}`);
  }
});

function onClearSearch() {
  history.pushState(lastState, '', `?`);
}

async function doSearch(query: string, source: string = 'user') {
  if (isLoading.value) {
    return; // Prevent multiple simultaneous searches
  }
  isLoading.value = true;
  // Simulate an API call with a delay

  try {
    searchQuery.value = query;
    if (source !== 'popstate') {
      onNewAction('search', query);
    }
    const r = await fetch(`${SERVER}/textRetrieval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, index: retrievalIndex.value, hybrid: useHybrid.value, rerank: useReranker.value, classificationSystem: classificationSystem.value })
    });

    const d = await r.json();
    urlItemMap.clear();
    results.value = d.data.map((x: any) => {
      const tags = [];
      if (x.dcCategories?.length) {
        for (const c of x.dcCategories) {
          const key = `${c.identifier}: ${c.name}`;
          dcCategoriesMap.set(key, c);
          tags.push(key);
        }
      }

      const r = {
        title: x.name,
        link: x.url,
        snippet: (x.abstract || '').slice(0, 384) + '...', // Assuming the API returns an abstract field
        domain: `${x.lang}.wikipedia.org`,
        tags,
      };
      urlItemMap.set(x.url, x);

      return r;

    }); // Assuming the API returns results in this format
    totalCount.value = d.meta.total; // Assuming the API returns total count in this format
    searchTime.value = d.meta.took; // Assuming the API returns search time in this format
  } catch (err) {
    // send notification
    alert(`${err}`);
  }
  finally {
    isLoading.value = false;
  }
  // Here you would typically make an actual API call to fetch search results
  // For this example, we will just use the mock results
}

async function doMatch(vector: string, source: string = 'user') {
  if (isLoading.value) {
    return; // Prevent multiple simultaneous searches
  }
  isLoading.value = true;
  // Simulate an API call with a delay


  try {
    if (source !== 'popstate') {
      onNewAction('match', vector);
    }
    const r = await fetch(`${SERVER}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: vector, classificationSystem: classificationSystem.value })
    });

    const d = await r.json();
    urlItemMap.clear();

    results.value = d.data.map((x: any) => {
      const tags = [];
      if (x.dcCategories?.length) {
        for (const c of x.dcCategories) {
          dcCategoriesMap.set(c.identifier, c);
          tags.push(`${c.identifier}: ${c.name}`);
        }
      }
      const r = {
        title: x.name,
        link: x.url,
        snippet: (x.abstract || '').slice(0, 384) + '...', // Assuming the API returns an abstract field
        domain: `${x.lang}.wikipedia.org`,
        tags,
      };
      urlItemMap.set(x.url, x);

      return r;

    }); // Assuming the API returns results in this format
    totalCount.value = d.meta.total; // Assuming the API returns total count in this format
    searchTime.value = d.meta.took; // Assuming the API returns search time in this format

  } catch (err) {
    // send notification
    alert(`${err}`);
  }
  finally {
    isLoading.value = false;
  }
  // Here you would typically make an actual API call to fetch search results
  // For this example, we will just use the mock results
}

async function doClassify(vector: string, source: string = 'user') {
  if (isLoading.value) {
    return; // Prevent multiple simultaneous searches
  }
  isLoading.value = true;
  // Simulate an API call with a delay

  try {
    if (source !== 'popstate') {
      onNewAction('classify', vector);
    }
    const r = await fetch(`${SERVER}/category`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: vector, classificationSystem: classificationSystem.value })
    });

    const d = await r.json();
    urlItemMap.clear();

    results.value = d.data?.map((x: any) => {
      const tags = [];
      if (x.dcCategories?.length) {
        for (const c of x.dcCategories) {
          dcCategoriesMap.set(c.identifier, c);
          tags.push(`${c.identifier}: ${c.name}`);
        }
      }
      const r = {
        title: x.name,
        link: x.url,
        snippet: (x.abstract || '').slice(0, 384) + '...', // Assuming the API returns an abstract field
        domain: `${x.lang}.wikipedia.org`,
        tags,
      };
      urlItemMap.set(x.url, x);

      return r;

    }); // Assuming the API returns results in this format
    totalCount.value = d.meta.total; // Assuming the API returns total count in this format
    searchTime.value = d.meta.took; // Assuming the API returns search time in this format

  } catch (err) {
    // send notification
    alert(`${err}`);
  }
  finally {
    isLoading.value = false;
  }
  // Here you would typically make an actual API call to fetch search results
  // For this example, we will just use the mock results
}


function onDoSearchEvent(query: string) {
  if (!query) {
    return;
  }
  doSearch(query);
  searchQuery.value = query;
  navigationBar.value = `${getOpts()} Query: ${query}`;
}

function onDoNavigateEvent(ref: SearchResult, tag?: string) {
  if (!ref) {
    return;
  }
  const item = urlItemMap.get(ref.link);
  if (!item) {
    return;
  }
  if (!tag) {
    doMatch(item.meanMatching);
    navigationBar.value = `${getOpts()} Match: ${item.name}`;
    searchQuery.value = '';

    return;
  }

  const ctg = dcCategoriesMap.get(tag);
  if (!ctg) {
    return;
  }
  doClassify(ctg.vector);
  navigationBar.value = `${getOpts()} Classify: ${tag}`;
  searchQuery.value = '';
}


// useMetaTags({
//   page: 'vibe_search',
//   url: 'vibe-search-demo',
// });
</script>
