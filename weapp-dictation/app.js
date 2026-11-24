App({
  globalData: {
    statusBarHeight: 20,
    windowWidth: 375,
    isWide: false
  },

  onLaunch() {
    let info = {};
    try {
      info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    } catch (e) {
      info = {};
    }
    const width = info.windowWidth || 375;
    this.globalData.statusBarHeight = info.statusBarHeight || 20;
    this.globalData.windowWidth = width;
    this.globalData.isWide = width >= 700;
  }
});
