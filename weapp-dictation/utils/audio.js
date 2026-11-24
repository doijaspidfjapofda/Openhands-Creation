// 语音播放适配层。
//
// 当前原型没有真实音频资产，默认使用“演示占位”：按文本长度模拟播放时长，
// 界面会明确标注为演示占位，不冒充真实配音。
//
// 正式接入时按顺序任选一种：
// 1) 本地音频：把 assets/audio/<wordId>.mp3 放好，useLocalAudio 改为 true；
// 2) 微信同声传译插件：app.json 声明 plugins 后把 useWechatSI 改为 true；
// 3) 自建 TTS：把 ttsEndpoint 指向返回 { url } 的接口。
const CONFIG = {
  useLocalAudio: false,
  localAudioBase: '/assets/audio/',
  useWechatSI: false,
  ttsEndpoint: '',
  demoBaseMs: 700,
  demoMsPerChar: 110
};

let ctx = null;
let endedHandler = null;
let errorHandler = null;
let timer = null;
let token = 0;

function firstMeaning(zh) {
  return String(zh || '').split(/[；;]/)[0];
}

function stop() {
  token += 1;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (ctx) {
    try {
      ctx.stop();
    } catch (e) {
      // ignore
    }
  }
}

function playSrc(src, handlers) {
  const myToken = token;
  if (!ctx) {
    ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
  }
  if (endedHandler) {
    ctx.offEnded(endedHandler);
    endedHandler = null;
  }
  if (errorHandler) {
    ctx.offError(errorHandler);
    errorHandler = null;
  }
  try {
    ctx.stop();
  } catch (e) {
    // ignore
  }

  endedHandler = function () {
    if (myToken === token && handlers.onEnd) handlers.onEnd();
  };
  errorHandler = function (err) {
    if (myToken !== token) return;
    if (handlers.onError) handlers.onError(err);
    else demo(handlers.text, handlers.language, handlers);
  };

  ctx.onEnded(endedHandler);
  ctx.onError(errorHandler);
  ctx.src = src;
  ctx.play();
  if (handlers.onStart) handlers.onStart('audio');
}

function demo(text, language, handlers) {
  const myToken = token;
  const perChar = language === 'zh' ? 150 : CONFIG.demoMsPerChar;
  const duration = Math.min(4200, CONFIG.demoBaseMs + perChar * String(text || '').length);
  if (handlers.onStart) handlers.onStart('demo', duration);
  timer = setTimeout(function () {
    timer = null;
    if (myToken === token && handlers.onEnd) handlers.onEnd();
  }, duration);
}

function playWechatSI(text, language, handlers) {
  let plugin = null;
  try {
    plugin = requirePlugin('WechatSI');
  } catch (e) {
    plugin = null;
  }
  if (!plugin) {
    demo(text, language, handlers);
    return;
  }
  plugin.textToSpeech({
    lang: language === 'zh' ? 'zh_CN' : 'en_US',
    tts: true,
    content: text,
    success(res) {
      playSrc(res.filename, {
        text,
        language,
        onStart: handlers.onStart,
        onEnd: handlers.onEnd,
        onError: function () {
          demo(text, language, handlers);
        }
      });
    },
    fail() {
      demo(text, language, handlers);
    }
  });
}

function playTTS(text, language, handlers) {
  wx.request({
    url: CONFIG.ttsEndpoint,
    data: { text: text, lang: language === 'zh' ? 'zh' : 'en' },
    success(res) {
      const url = res.data && res.data.url;
      if (!url) {
        demo(text, language, handlers);
        return;
      }
      playSrc(url, {
        text,
        language,
        onStart: handlers.onStart,
        onEnd: handlers.onEnd,
        onError: function () {
          demo(text, language, handlers);
        }
      });
    },
    fail() {
      demo(text, language, handlers);
    }
  });
}

function playWord(word, language, handlers) {
  const h = handlers || {};
  const lang = language === 'en' ? 'en' : 'zh';
  const text = lang === 'zh' ? firstMeaning(word.zh) : word.en;

  stop();

  if (CONFIG.useLocalAudio) {
    playSrc(CONFIG.localAudioBase + word.id + '.mp3', {
      text,
      language: lang,
      onStart: h.onStart,
      onEnd: h.onEnd,
      onError: function () {
        demo(text, lang, h);
      }
    });
    return;
  }

  if (CONFIG.useWechatSI) {
    playWechatSI(text, lang, h);
    return;
  }

  if (CONFIG.ttsEndpoint) {
    playTTS(text, lang, h);
    return;
  }

  demo(text, lang, h);
}

function hasRealAudio() {
  return CONFIG.useLocalAudio || CONFIG.useWechatSI || !!CONFIG.ttsEndpoint;
}

module.exports = {
  CONFIG,
  playWord,
  stop,
  hasRealAudio
};
