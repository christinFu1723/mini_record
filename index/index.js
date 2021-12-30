const app = getApp();
const recorderConfig = {
  duration: 600000,
  frameSize: 5, //指定当录音大小达到5KB时触发onFrameRecorded
  format: "PCM",

  sampleRate: 16000,
  encodeBitRate: 96000,
  numberOfChannels: 1,
};
Page({
  data: {
    flg: false,
    context: "", // camera context
    recorderManager: "", // 录音
    listener: "", // camera context frame listener
    manager: "", // 同声传译插件
  },
  onLoad: function () {
    this.initRecord();
    this.data.context = wx.createCameraContext(); // 创建camera context
    this.data.listener = this.data.context.onCameraFrame((frame) => {
      this.drawImgByFrame(frame);
    });
  },
  // 抽帧截图
  drawImgByFrame(frame) {
    const that = this;
    var u8ca = new Uint8ClampedArray(frame.data);
    if (that.data.flg) {
      that.data.flg = false;

      wx.canvasPutImageData({
        canvasId: "myCanvas",
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        data: u8ca,
        success(res) {
          console.log("canvas绘制成功");
          wx.canvasToTempFilePath({
            x: 0,
            y: 0,

            canvasId: "myCanvas",
            success(res) {
              console.log("canvas生成临时路径", res);
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
              });
              that.data.listener.stop();
            },
          });
        },
        fail(e) {
          console.log("canvas绘图失败", e);
        },
      });
    }
  },
  // 截图抽帧
  snapShot() {
    wx.showToast({
      title: "截图抽帧成功",
      icon: "success",
      duration: 2000,
    });
    this.data.listener.start();
    this.data.flg = true;
  },
  // 初始化语音识别插件
  initRecord() {
    var plugin = requirePlugin("WechatSI");
    this.data.manager = plugin.getRecordRecognitionManager();
    const that = this;
    //有新的识别内容返回，则会调用此事件
    this.data.manager.onRecognize = function (res) {
      let text = res.result;
      that.setData({
        currentText: text,
      });
      console.log("current result", res.result);
    };
    // 识别结束事件
    this.data.manager.onStop = function (res) {
      console.log("record file path", res.tempFilePath);
      console.log("result", res.result);
      let text = res.result;
      if (text == "") {
        // 用户没有说话，可以做一下提示处理...
        return;
      }
      that.setData({
        currentText: text,
      });
    };
    this.data.manager.onStart = function (res) {
      console.log("成功开始录音识别", res);
    };
    this.data.manager.onError = function (res) {
      console.error("error msg", res.msg);
    };
  },
  // 同声传译，开始录音，并触发语音识别
  streamRecord() {
    this.data.manager.start({
      lang: "zh_CN",
    });
  },
  // 同声传译，结束录音
  endStreamRecord() {
    this.data.manager.stop();
  },

  // 开始录视频
  record() {
    wx.showToast({
      title: "开始录视频",
      icon: "success",
      duration: 2000,
    });

    this.data.context.startRecord();
    this.linkSocket(); // 开始websocket 链接，并录音
  },
  // 停止录视频
  stopRecord() {
    this.data.context.stopRecord({
      success: (res) => {
        wx.showToast({
          title: "停止录视频成功",
          icon: "success",
          duration: 2000,
        });

        console.log("停止录视频成功", res);

        wx.saveVideoToPhotosAlbum({
          filePath: res.tempVideoPath,
          success(res) {
            console.log(res.errMsg);
          },
        });
      },
    });
    this.data.listener.stop(); // camera context listen 停止监听
    this.wsStop(); // 录音停止，断开socket
  },
  // 建立websocket 并开始录音
  linkSocket() {
    let _this = this;

    let sn = new Date().getTime(); //这里的sn是百度实时语音用于排查日志，这里我图方便就用时间戳了
    wx.showLoading({
      title: "识别中...",
    });

    if (!_this.data.recorderManager) {
      _this.data.recorderManager = wx.getRecorderManager();

      _this.handleRecordVoiceStop(); // 监听录音停止、录音帧回调、录音中断事件，并处理
    }
    _this.data.recorderManager.start(recorderConfig); // 开始录音

    //开启链接
    wx.connectSocket({
      url: "wss://vop.baidu.com/realtime_asr?sn=" + sn,
      protocols: ["websocket"],
      success() {
        console.log("连接成功");
        _this.initEventHandle();
      },
    });
  },
  // websocket 开始发送语音识别标识
  wsStart() {
    let config = {
      type: "START",
      data: {
        appid: 25437153, //百度实时语音识别appid
        appkey: "k85df0Lndb2nixhtv7QPiY0L", //百度实时语音识别key
        dev_pid: 15372, // 中文普通话	加强标点（逗号、句号、问号、感叹号）
        cuid: "cuid-1",
        format: "pcm",
        sample: 16000,
      },
    };
    wx.sendSocketMessage({
      data: JSON.stringify(config),
      success(res) {
        console.log("发送开始帧成功");
      },
    });
  },
  // websocket 传输数据
  wsSend(data) {
    wx.sendSocketMessage({
      data: data,
      success(res) {
        console.log("发送数据帧成功");
      },
    });
  },
  // websocket 停止识别
  wsStop() {
    let config = {
      type: "FINISH",
    };
    wx.hideLoading();
    this.data.recorderManager.stop();
    wx.sendSocketMessage({
      data: JSON.stringify(config),
      success(res) {
        console.log("发送结束帧成功");
      },
    });
  },
  // 处理录音中断，断开socket
  wsStopForAcc() {
    let config = {
      type: "FINISH",
    };
    wx.sendSocketMessage({
      data: JSON.stringify(config),
      success(res) {
        wx.hideLoading();
        console.log("发送结束帧成功");
      },
    });
  },

  // 处理录音停止
  handleRecordVoiceStop() {
    const that = this;

    that.data.recorderManager.onFrameRecorded(function (res) {
      let data = res.frameBuffer;
      that.wsSend(data); // 触发录音分段器回调，发送至语音识别
    });

    that.data.recorderManager.onInterruptionBegin(function (res) {
      console.log("录音中断");
      that.wsStopForAcc(); // 处理录音中断
    });
    this.data.recorderManager.onStop((res) => {
      console.log("侦听到结束录音", res, that.data);
      wx.saveFile({
        tempFilePath: res.tempFilePath,
        success(resp) {
          console.log("保存音频成功", resp);
          let innerAudioCtx = wx.createInnerAudioContext();
          innerAudioCtx.src = resp.savedFilePath;
          innerAudioCtx.play();
        },
      });
    });
  },

  //监听websocket返回的数据
  initEventHandle() {
    let _this = this;
    wx.onSocketMessage((res) => {
      let result = JSON.parse(res.data.replace("\n", ""));
      console.log("socket回调", res);
      if (result.type == "MID_TEXT") {
        // 一句话的临时识别结果
        _this.setData({
          value: result.result,
        });
      }
      if (result.type == "FIN_TEXT") {
        // 一句话的最终识别结果
        let value = _this.data.currentText;
        let tranStr = value + result.result;
        _this.setData({
          currentText: tranStr,
        });
      }
    });
    wx.onSocketOpen(() => {
      //发送数据帧
      _this.wsStart();
      console.log("WebSocket连接打开");
    });
    wx.onSocketError(function (res) {
      wx.hideLoading();
      console.log("WebSocket连接打开失败");
    });
    wx.onSocketClose(function (res) {
      wx.hideLoading();
      console.log("WebSocket 已关闭！");
    });
  },
});
