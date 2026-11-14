const api = require("../../utils/api");
const flow = require("../../utils/workflow-client");
const policy = require("../../utils/memorial-policy");
const blank = () => ({
  name: "",
  birthDate: "",
  deathDate: "",
  biography: "",
  memories: "",
  portraitImageId: null,
});
Page({
  workflowNamespace: "memorial",
  data: {
    mode: "loading",
    pageTitle: "悼念专区",
    loading: true,
    busy: false,
    error: "",
    publicEnabled: false,
    today: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    privateLocked: false,
    form: blank(),
    hall: null,
    items: [],
    reports: [],
    portrait: "",
    proofId: "",
    proofReady: false,
    relationship: "",
    statement: "",
    agreed: false,
    publicRequested: false,
    blessings: policy.blessings,
    query: "",
    page: 1,
    hasMore: false,
    pending: null,
    reportOpen: false,
    reportKinds: [
      "冒用身份或虚假纪念",
      "涉及隐私侵权",
      "近亲属相关权利请求",
      "其他事项",
    ],
    reportIndex: 0,
    reportReason: "",
    tributeFeedback: "",
  },
  onLoad(options) {
    this.options = options || {};
  },
  onShow() {
    this.disposed = false;
    this.version = (this.version || 0) + 1;
    require("../../utils/theme").apply(this);
    const uid = flow.owner();
    if (this.owner && this.owner !== uid) {
      this.formLoaded = false;
      this.options = {};
      this.setData({
        hall: null,
        items: [],
        reports: [],
        form: blank(),
        portrait: "",
        proofId: "",
        proofReady: false,
        statement: "",
        relationship: "",
        agreed: false,
        publicRequested: false,
        mode: "portal",
      });
    }
    this.owner = uid;
    if (this.formLoaded && this.data.mode === "form") return;
    return this.load();
  },
  onAuthResumed() {
    this.formLoaded = false;
    return this.load();
  },
  onHide() {
    this.version = (this.version || 0) + 1;
  },
  onUnload() {
    this.disposed = true;
    this.version = (this.version || 0) + 1;
  },
  onPullDownRefresh() {
    return this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    const version = this.version;
    this.setData({ loading: true, error: "", pending: flow.pending(this) });
    try {
      const config = await api.request("GET", "/api/v1/config");
      if (this.disposed || version !== this.version) return;
      this.setData({ publicEnabled: config.features?.memorialPublic === true });
      if (this.options.id) {
        const result = await api.request(
          "GET",
          "/api/v1/memorial/halls/" + encodeURIComponent(this.options.id),
        );
        if (this.disposed || version !== this.version) return;
        this.setData({
          mode: "detail",
          pageTitle: "追思纪念",
          hall: result.hall,
          portrait: require("../../utils/presentation").media(
            result.hall.portraitUrl,
          ),
          reportOpen: false,
          tributeFeedback: "",
        });
        return;
      }
      if (
        this.options.own ||
        ["create", "manage"].includes(this.options.mode)
      ) {
        if (!api.hasSession()) {
          this.setData({ privateLocked: true });
          await api.login();
          return;
        }
        this.owner = flow.owner();
        this.setData({ privateLocked: false });
        if (this.options.own) {
          const result = await api.request(
            "GET",
            "/api/v1/memorial/me/halls/" + encodeURIComponent(this.options.own),
            null,
            true,
            this.owner,
          );
          if (!flow.alive(this, this.owner, version)) return;
          const hall = result.hall;
          this.setData({
            mode: "form",
            pageTitle: "纪念馆管理",
            hall,
            form: { ...blank(), ...hall.payload },
            portrait: "",
            proofId: hall.authorization?.proofId || "",
            proofReady: !!hall.authorization?.proofId,
            relationship: hall.authorization?.relationship || "",
            statement: hall.authorization?.statement || "",
            agreed: false,
            publicRequested: !!hall.requested_public,
            statusText: policy.statusNames[hall.status],
          });
          this.formLoaded = true;
          this.clean = JSON.stringify(this.data.form);
          if (hall.portrait_image_id) {
            const portrait = await api.privateImage(hall.portrait_image_id);
            if (flow.alive(this, this.owner, version))
              this.setData({ portrait });
          }
        } else if (this.options.mode === "create") {
          if (!this.formLoaded) {
            this.setData({
              mode: "form",
              pageTitle: "创建纪念馆",
              form: blank(),
              hall: null,
              portrait: "",
              proofId: "",
              proofReady: false,
              relationship: "",
              statement: "",
              agreed: false,
              publicRequested: false,
              clientKey: "memorial_" + flow.ticket(),
              statusText: "草稿",
            });
            this.formLoaded = true;
            this.clean = JSON.stringify(this.data.form);
          }
        } else {
          const [list, reports] = await Promise.all([
            api.request(
              "GET",
              "/api/v1/memorial/me/halls",
              null,
              true,
              this.owner,
            ),
            api.request(
              "GET",
              "/api/v1/memorial/me/reports",
              null,
              true,
              this.owner,
            ),
          ]);
          if (flow.alive(this, this.owner, version))
            this.setData({
              mode: "manage",
              pageTitle: "纪念馆管理",
              items: list.items.map((item) => ({
                ...item,
                name: item.payload?.name || "未命名纪念馆",
                statusText: policy.statusNames[item.status],
              })),
              reports: reports.items,
              hasMore: list.hasMore,
              page: 1,
            });
        }
        return;
      }
      if (this.options.mode === "browse") {
        const result = await api.request(
          "GET",
          "/api/v1/memorial/halls?q=" + encodeURIComponent(this.data.query),
        );
        if (!this.disposed && version === this.version)
          this.setData({
            mode: "browse",
            pageTitle: "追思纪念",
            items: result.items,
            hasMore: result.hasMore,
            page: 1,
          });
        return;
      }
      this.setData({ mode: "portal", pageTitle: "悼念专区" });
    } catch (error) {
      if (!this.disposed && version === this.version)
        this.setData({ error: error.message });
    } finally {
      if (!this.disposed && version === this.version)
        this.setData({ loading: false });
    }
  },
  async more() {
    if (
      this.data.loading ||
      !this.data.hasMore ||
      !["browse", "manage"].includes(this.data.mode)
    )
      return;
    const version = this.version,
      uid = flow.owner(),
      page = this.data.page + 1;
    this.setData({ loading: true });
    try {
      const result = await api.request(
        "GET",
        this.data.mode === "browse"
          ? "/api/v1/memorial/halls?q=" +
              encodeURIComponent(this.data.query) +
              "&page=" +
              page
          : "/api/v1/memorial/me/halls?page=" + page,
        null,
        this.data.mode === "manage",
        uid || undefined,
      );
      if (!this.disposed && version === this.version && uid === flow.owner())
        this.setData({
          items: [
            ...this.data.items,
            ...result.items.map((item) => ({
              ...item,
              name: item.name || item.payload?.name || "未命名纪念馆",
              statusText: policy.statusNames[item.status],
            })),
          ],
          page,
          hasMore: result.hasMore,
        });
    } catch (error) {
      if (!this.disposed) this.setData({ error: error.message });
    } finally {
      if (!this.disposed) this.setData({ loading: false });
    }
  },
  async signin() {
    try {
      await api.login();
      this.setData({ privateLocked: false });
      return this.load();
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  openCreate() {
    wx.navigateTo({ url: "/pages/memorial/index?mode=create" });
  },
  openManage() {
    wx.navigateTo({ url: "/pages/memorial/index?mode=manage" });
  },
  openBrowse() {
    wx.navigateTo({ url: "/pages/memorial/index?mode=browse" });
  },
  openOwn(event) {
    wx.navigateTo({
      url: "/pages/memorial/index?own=" + event.currentTarget.dataset.id,
    });
  },
  openHall(event) {
    wx.navigateTo({
      url: "/pages/memorial/index?id=" + event.currentTarget.dataset.id,
    });
  },
  input(event) {
    if (this.data.busy) return;
    const key = event.currentTarget.dataset.key;
    if (
      ["name", "birthDate", "deathDate", "biography", "memories"].includes(key)
    ) {
      this.setData({ ["form." + key]: event.detail.value, agreed: false });
      this.dirtyChanged();
    } else if (
      ["relationship", "statement", "query", "reportReason"].includes(key)
    )
      this.setData({ [key]: event.detail.value });
  },
  dirtyChanged() {
    this.setData({ agreed: false });
    if (JSON.stringify(this.data.form) !== this.clean)
      wx.enableAlertBeforeUnload?.({
        message: "纪念资料尚未保存，请先保存草稿。",
      });
    else wx.disableAlertBeforeUnload?.();
  },
  async choosePortrait() {
    if (this.data.busy) return;
    try {
      await api.login();
      const uid = flow.owner(),
        version = this.version;
      const selection = await new Promise((resolve, reject) =>
        require("../../utils/image-picker").chooseImages({
          count: 1,
          success: resolve,
          fail: reject,
        }),
      );
      if (!flow.alive(this, uid, version)) return;
      this.setData({ busy: true });
      const file = selection.tempFiles?.[0];
      if (!file) return;
      const image = await api.uploadImage(
        file.tempFilePath,
        uid + ":" + wx.getStorageSync("city_life_v2_auth_token"),
      );
      if (flow.alive(this, uid, version)) {
        this.setData({
          "form.portraitImageId": image.id,
          portrait: file.tempFilePath,
        });
        this.dirtyChanged();
      }
    } catch (error) {
      api.showError(error);
    } finally {
      if (!this.disposed) this.setData({ busy: false });
    }
  },
  removePortrait() {
    if (!this.data.busy) {
      this.setData({ "form.portraitImageId": null, portrait: "" });
      this.dirtyChanged();
    }
  },
  async write(method, url, input) {
    try {
      const result = await flow.write(this, method, url, input);
      if (!result.live) return null;
      return result.result;
    } catch (error) {
      if (!this.disposed) {
        if (error.code === "MEMORIAL_CONSENT_REQUIRED")
          this.setData({ agreed: false });
        this.setData({ error: error.message, pending: flow.pending(this) });
      }
      return null;
    }
  },
  async saveDraft() {
    if (this.data.busy) return false;
    const hall = this.data.hall;
    const result = await this.write(
      hall ? "PUT" : "POST",
      "/api/v1/memorial/halls" + (hall ? "/" + hall.id : ""),
      {
        clientKey: hall?.client_key || this.data.clientKey,
        payload: this.data.form,
        ...(hall ? { revision: hall.revision } : {}),
      },
    );
    if (!result?.hall) return false;
    this.options = { own: result.hall.id };
    this.setData({
      hall: result.hall,
      statusText: policy.statusNames[result.hall.status],
    });
    this.clean = JSON.stringify(this.data.form);
    wx.disableAlertBeforeUnload?.();
    this.formLoaded = false;
    await this.load();
    wx.showToast({ title: "草稿已保存", icon: "success" });
    return true;
  },
  async uploadProof() {
    if (this.data.busy) return;
    if (!this.data.hall || JSON.stringify(this.data.form) !== this.clean) {
      this.setData({ error: "请先保存当前纪念资料，再提交授权材料。" });
      return;
    }
    try {
      const uid = flow.owner(),
        version = this.version,
        selection = await new Promise((resolve, reject) =>
          require("../../utils/image-picker").chooseImages({
            count: 1,
            success: resolve,
            fail: reject,
          }),
        );
      if (!flow.alive(this, uid, version)) return;
      this.setData({ busy: true, error: "" });
      const file = selection.tempFiles?.[0];
      if (!file) return;
      const proof = await api.uploadMemorialProof(
        this.data.hall.id,
        file.tempFilePath,
      );
      if (flow.alive(this, uid, version))
        this.setData({ proofId: proof.id, proofReady: true });
    } catch (error) {
      api.showError(error);
    } finally {
      if (!this.disposed) this.setData({ busy: false });
    }
  },
  async viewProof() {
    try {
      if (!this.data.proofId) return;
      const file = await api.privateMemorialProof(this.data.proofId);
      wx.previewImage({ urls: [file] });
    } catch (error) {
      api.showError(error);
    }
  },
  async authorize() {
    if (!this.data.hall || this.data.busy) return;
    if (JSON.stringify(this.data.form) !== this.clean) {
      this.setData({ error: "请先保存资料修改，再提交授权核验。" });
      return;
    }
    const result = await this.write(
      "POST",
      "/api/v1/memorial/halls/" + this.data.hall.id + "/authorization",
      {
        revision: this.data.hall.revision,
        relationship: this.data.relationship,
        statement: this.data.statement,
        proofId: this.data.proofId,
      },
    );
    if (result) {
      this.formLoaded = false;
      await this.load();
    }
  },
  consentChanged(event) {
    this.setData({ agreed: event.detail.value.includes("agree") });
  },
  publicChanged(event) {
    this.setData({ publicRequested: !!event.detail.value, agreed: false });
  },
  readPolicy() {
    wx.navigateTo({ url: "/pages/legal/index?kind=memorial" });
  },
  async submit() {
    const hall = this.data.hall;
    if (!hall || this.data.busy) return;
    if (!this.data.agreed || JSON.stringify(this.data.form) !== this.clean) {
      this.setData({ error: "请先保存资料，并确认授权及本次公开范围。" });
      return;
    }
    const result = await this.write(
      "POST",
      "/api/v1/memorial/halls/" + hall.id + "/submit",
      {
        revision: hall.revision,
        consent: {
          accepted: true,
          version: policy.noticeVersion,
          publicRequested: this.data.publicRequested,
        },
      },
    );
    if (result) {
      this.formLoaded = false;
      await this.load();
      wx.showToast({ title: "已提交审核", icon: "none" });
    }
  },
  async ownerAction(event) {
    const action = event.currentTarget.dataset.action,
      hall = this.data.hall;
    if (!hall || this.data.busy) return;
    if (
      !(await flow.confirm(
        action === "delete"
          ? "确认删除本纪念馆？公开页面和照片访问会停止，必要审核及核验记录按规则处理。"
          : "确认隐藏本纪念馆？隐藏后停止公开查询和照片访问。",
      ))
    )
      return;
    const result = await this.write(
      "POST",
      "/api/v1/memorial/halls/" + hall.id + "/action",
      { revision: hall.revision, action },
    );
    if (result) {
      this.formLoaded = false;
      this.options =
        action === "delete" ? { mode: "manage" } : { own: hall.id };
      await this.load();
    }
  },
  async tribute(event) {
    if (this.data.busy) return;
    const kind = event.currentTarget.dataset.kind,
      blessingCode = event.currentTarget.dataset.code;
    const result = await this.write(
      "POST",
      "/api/v1/memorial/halls/" + this.data.hall.id + "/tributes",
      { kind, ...(blessingCode ? { blessingCode } : {}) },
    );
    if (result)
      this.setData({
        tributeFeedback: result.alreadySent
          ? "今天的这份心意已经寄达。"
          : "心意已寄达，思念长存。",
      });
  },
  toggleReport() {
    this.setData({ reportOpen: !this.data.reportOpen });
  },
  reportType(event) {
    this.setData({ reportIndex: Number(event.detail.value) });
  },
  async sendReport() {
    const result = await this.write(
      "POST",
      "/api/v1/memorial/halls/" + this.data.hall.id + "/reports",
      {
        kind: ["impersonation", "privacy", "rights", "other"][
          this.data.reportIndex
        ],
        reason: this.data.reportReason,
      },
    );
    if (result) {
      this.setData({ reportOpen: false, reportReason: "" });
      wx.showModal({
        title: "核查请求已提交",
        content: "可在纪念馆管理中查看本人请求及处理答复。",
        showCancel: false,
      });
    }
  },
  search() {
    this.options = { mode: "browse" };
    return this.load();
  },
  async resume() {
    try {
      const result = await flow.resume(this);
      if (result?.live) {
        if (result.result.hall) this.options = { own: result.result.hall.id };
        this.formLoaded = false;
        await this.load();
      }
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  async clearPending() {
    if (
      await flow.confirm("请先核对上次提交结果。确认结果后清除本机待核对请求？")
    ) {
      flow.abandon(this);
      this.setData({ pending: null });
    }
  },
  back() {
    if (this.data.busy) return;
    if (
      this.data.mode === "form" &&
      JSON.stringify(this.data.form) !== this.clean
    ) {
      wx.showActionSheet({
        itemList: ["保存草稿并返回", "放弃修改并返回", "继续编辑"],
        success: async (result) => {
          if (result.tapIndex === 0) {
            if (await this.saveDraft()) this.leave();
          } else if (result.tapIndex === 1) this.leave();
        },
      });
      return;
    }
    this.leave();
  },
  leave() {
    wx.disableAlertBeforeUnload?.();
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/publish/index" }),
    });
  },
});
