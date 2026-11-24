// 演示词表：仅用于交互原型，不是正式教材内容。
const WORDS = [
  // 人教版 · 七年级上册 · Unit 1
  { id: 'r7a-u1-name', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'name', ipa: '/neɪm/', zh: '名字；名称', example: 'My name is Lily.', translation: '我的名字是莉莉。' },
  { id: 'r7a-u1-country', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'country', ipa: '/ˈkʌntri/', zh: '国家', example: 'Which country are you from?', translation: '你来自哪个国家？' },
  { id: 'r7a-u1-classmate', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'classmate', ipa: '/ˈklɑːsmeɪt/', zh: '同班同学', example: 'She is my classmate.', translation: '她是我的同班同学。' },
  { id: 'r7a-u1-hobby', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'hobby', ipa: '/ˈhɒbi/', zh: '业余爱好', example: 'Reading is my hobby.', translation: '阅读是我的爱好。' },
  { id: 'r7a-u1-friend', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'friend', ipa: '/frend/', zh: '朋友', example: 'He is my best friend.', translation: '他是我最好的朋友。' },
  { id: 'r7a-u1-quiet', version: '人教', grade: '七年级', term: '上册', unit: 1, en: 'quiet', ipa: '/ˈkwaɪət/', zh: '安静的', example: 'Please be quiet.', translation: '请保持安静。' },

  // 人教版 · 七年级上册 · Unit 2
  { id: 'r7a-u2-family', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'family', ipa: '/ˈfæməli/', zh: '家庭；家人', example: 'I love my family.', translation: '我爱我的家人。' },
  { id: 'r7a-u2-cousin', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'cousin', ipa: '/ˈkʌzən/', zh: '堂兄弟姐妹；表兄弟姐妹', example: 'My cousin is twelve.', translation: '我的表妹十二岁。' },
  { id: 'r7a-u2-parent', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'parent', ipa: '/ˈpeərənt/', zh: '父亲或母亲', example: 'A parent can help you.', translation: '父亲或母亲可以帮助你。' },
  { id: 'r7a-u2-uncle', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'uncle', ipa: '/ˈʌŋkəl/', zh: '叔叔；伯伯；舅舅等', example: 'My uncle is a teacher.', translation: '我的叔叔是一名老师。' },
  { id: 'r7a-u2-aunt', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'aunt', ipa: '/ɑːnt/', zh: '姑姑；姨母；婶婶等', example: 'My aunt lives nearby.', translation: '我的姑姑住在附近。' },
  { id: 'r7a-u2-grandfather', version: '人教', grade: '七年级', term: '上册', unit: 2, en: 'grandfather', ipa: '/ˈɡrænfɑːðə/', zh: '祖父；外祖父', example: 'My grandfather likes tea.', translation: '我的爷爷喜欢喝茶。' },

  // 人教版 · 七年级上册 · Unit 3
  { id: 'r7a-u3-library', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'library', ipa: '/ˈlaɪbrəri/', zh: '图书馆', example: 'We read in the library.', translation: '我们在图书馆看书。' },
  { id: 'r7a-u3-building', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'building', ipa: '/ˈbɪldɪŋ/', zh: '建筑物；楼房', example: 'That building is tall.', translation: '那栋楼很高。' },
  { id: 'r7a-u3-classroom', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'classroom', ipa: '/ˈklɑːsruːm/', zh: '教室', example: 'Our classroom is clean.', translation: '我们的教室很干净。' },
  { id: 'r7a-u3-computer', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'computer', ipa: '/kəmˈpjuːtə/', zh: '电脑', example: 'I use a computer.', translation: '我使用电脑。' },
  { id: 'r7a-u3-playground', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'playground', ipa: '/ˈpleɪɡraʊnd/', zh: '操场；游乐场', example: 'They are on the playground.', translation: '他们在操场上。' },
  { id: 'r7a-u3-school', version: '人教', grade: '七年级', term: '上册', unit: 3, en: 'school', ipa: '/skuːl/', zh: '学校', example: 'I walk to school.', translation: '我步行去学校。' },

  // 人教版 · 七年级下册 · Unit 1
  { id: 'r7b-u1-guitar', version: '人教', grade: '七年级', term: '下册', unit: 1, en: 'guitar', ipa: '/ɡɪˈtɑː/', zh: '吉他', example: 'He plays the guitar well.', translation: '他吉他弹得很好。' },
  { id: 'r7b-u1-sing', version: '人教', grade: '七年级', term: '下册', unit: 1, en: 'sing', ipa: '/sɪŋ/', zh: '唱歌', example: 'She can sing English songs.', translation: '她会唱英文歌。' },
  { id: 'r7b-u1-swim', version: '人教', grade: '七年级', term: '下册', unit: 1, en: 'swim', ipa: '/swɪm/', zh: '游泳', example: 'I swim every Sunday.', translation: '我每周日游泳。' },
  { id: 'r7b-u1-dance', version: '人教', grade: '七年级', term: '下册', unit: 1, en: 'dance', ipa: '/dɑːns/', zh: '跳舞', example: 'They dance after school.', translation: '他们放学后跳舞。' },
  { id: 'r7b-u1-draw', version: '人教', grade: '七年级', term: '下册', unit: 1, en: 'draw', ipa: '/drɔː/', zh: '画画', example: 'Can you draw a cat?', translation: '你会画猫吗？' },

  // 人教版 · 八年级上册 · Unit 1
  { id: 'r8a-u1-anyone', version: '人教', grade: '八年级', term: '上册', unit: 1, en: 'anyone', ipa: '/ˈeniwʌn/', zh: '任何人', example: 'Did anyone call me?', translation: '有人给我打电话吗？' },
  { id: 'r8a-u1-anywhere', version: '人教', grade: '八年级', term: '上册', unit: 1, en: 'anywhere', ipa: '/ˈeniweə/', zh: '任何地方', example: "I can't find it anywhere.", translation: '我到处都找不到它。' },
  { id: 'r8a-u1-wonderful', version: '人教', grade: '八年级', term: '上册', unit: 1, en: 'wonderful', ipa: '/ˈwʌndəfl/', zh: '精彩的；极好的', example: 'We had a wonderful trip.', translation: '我们有一次很棒的旅行。' },
  { id: 'r8a-u1-quite', version: '人教', grade: '八年级', term: '上册', unit: 1, en: 'quite', ipa: '/kwaɪt/', zh: '相当；十分', example: 'It is quite cold today.', translation: '今天相当冷。' },
  { id: 'r8a-u1-activity', version: '人教', grade: '八年级', term: '上册', unit: 1, en: 'activity', ipa: '/ækˈtɪvəti/', zh: '活动', example: 'Reading is a quiet activity.', translation: '阅读是一项安静的活动。' },

  // 北师大版 · 七年级上册 · Unit 1
  { id: 'bs7a-u1-myself', version: '北师大', grade: '七年级', term: '上册', unit: 1, en: 'myself', ipa: '/maɪˈself/', zh: '我自己', example: 'I can do it myself.', translation: '我可以自己做。' },
  { id: 'bs7a-u1-greeting', version: '北师大', grade: '七年级', term: '上册', unit: 1, en: 'greeting', ipa: '/ˈɡriːtɪŋ/', zh: '问候；打招呼', example: 'He said a warm greeting.', translation: '他热情地打了招呼。' },
  { id: 'bs7a-u1-introduce', version: '北师大', grade: '七年级', term: '上册', unit: 1, en: 'introduce', ipa: '/ˌɪntrəˈdjuːs/', zh: '介绍', example: 'Let me introduce my friend.', translation: '让我介绍一下我的朋友。' },
  { id: 'bs7a-u1-welcome', version: '北师大', grade: '七年级', term: '上册', unit: 1, en: 'welcome', ipa: '/ˈwelkəm/', zh: '欢迎', example: 'Welcome to our school.', translation: '欢迎来到我们学校。' }
];

const GRADE_ORDER = ['七年级', '八年级', '九年级'];
const TERM_ORDER = ['上册', '下册'];

const byIdMap = {};
WORDS.forEach((w) => {
  byIdMap[w.id] = w;
});

function byId(id) {
  return byIdMap[id] || null;
}

function uniq(list) {
  return list.filter((v, i) => list.indexOf(v) === i);
}

function grades() {
  return uniq(WORDS.map((w) => w.grade)).sort(
    (a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b)
  );
}

function termsFor(grade) {
  return TERM_ORDER.filter((t) => WORDS.some((w) => w.grade === grade && w.term === t));
}

function versionsFor(grade, term) {
  return uniq(
    WORDS.filter((w) => w.grade === grade && w.term === term).map((w) => w.version)
  );
}

function unitsFor(version, grade, term) {
  const list = uniq(
    WORDS.filter((w) => w.version === version && w.grade === grade && w.term === term).map((w) => w.unit)
  );
  return list.sort((a, b) => a - b);
}

function filterWords(opts) {
  const o = opts || {};
  const q = String(o.query || '').trim().toLowerCase();
  return WORDS.filter((w) => {
    if (o.version && w.version !== o.version) return false;
    if (o.grade && w.grade !== o.grade) return false;
    if (o.term && w.term !== o.term) return false;
    if (o.unit && w.unit !== o.unit) return false;
    if (q && (w.en + ' ' + w.zh).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

module.exports = {
  WORDS,
  byId,
  grades,
  termsFor,
  versionsFor,
  unitsFor,
  filterWords
};
