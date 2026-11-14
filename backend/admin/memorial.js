"use strict";
let memorialPage = 1;
function memorialReason(root) {
  const label = cell("label", "核查依据与处理答复"),
    input = document.createElement("textarea");
  input.maxLength = 1000;
  input.placeholder = "说明实际完成的核查与处理，至少8字";
  label.append(input);
  root.append(label);
  return () => input.value;
}
function memorialChecks(root, labels) {
  const inputs = {};
  for (const [key, label] of labels) {
    const row = cell("label", label),
      input = document.createElement("input");
    input.type = "checkbox";
    row.prepend(input);
    root.append(row);
    inputs[key] = input;
  }
  return () =>
    Object.fromEntries(
      Object.entries(inputs).map(([key, input]) => [key, input.checked]),
    );
}
async function memorialDetail(root, id, qualification) {
  const base = qualification ? "authorizations" : "halls",
    result = await api("/admin/api/memorial/" + base + "/" + id),
    item = result.item;
  root.replaceChildren();
  root.append(
    cell(
      "h3",
      qualification ? "家属授权核验" : item.payload?.name || "纪念馆记录",
    ),
  );
  if (qualification) {
    root.append(
      cell(
        "p",
        "对应逝者：" +
          item.subject.name +
          " · " +
          (item.subject.birthDate || "未填写出生日期") +
          " — " +
          (item.subject.deathDate || "未填写逝世日期"),
      ),
    );
    root.append(
      cell("p", "实际提交关系：" + item.relationship),
      cell("p", item.statement),
    );
    const link = cell("a", "读取私有核验材料（访问留痕）");
    link.href = "/admin/api/memorial/proofs/" + item.proof_id;
    link.target = "_blank";
    link.rel = "noopener";
    root.append(link);
    const reason = memorialReason(root),
      read = memorialChecks(root, [
        [
          "manuallyVerified",
          "已实际核查家属关系、授权范围、资料使用权和对应逝者身份",
        ],
      ]);
    for (const [status, label] of [
      ["verified", "记录核验通过"],
      ["rejected", "要求补充或不予通过"],
      ["revoked", "撤销原核验"],
    ])
      root.append(
        button(label, async () => {
          await api("/admin/api/memorial/authorizations/" + id, "POST", {
            revision: item.revision,
            status,
            response: reason(),
            ...read(),
          });
          await loadMemorialConsole();
        }),
      );
  } else {
    root.append(
      cell(
        "p",
        "状态 " +
          item.status +
          " · 内容版本 " +
          item.revision +
          " · 申请范围 " +
          (item.requested_public ? "允许公开" : "本人管理"),
      ),
    );
    root.append(
      cell("p", "当前授权 " + (item.authorization?.status || "待提交")),
    );
    for (const key of [
      "name",
      "birthDate",
      "deathDate",
      "biography",
      "memories",
    ])
      if (item.payload?.[key]) root.append(cell("p", item.payload[key]));
    if (item.portrait_image_id) {
      const image = document.createElement("img");
      image.src = "/admin/api/media/" + item.portrait_image_id;
      image.className = "content-preview";
      image.alt = "本纪念馆待审核照片";
      root.append(image);
    }
    const reason = memorialReason(root),
      read = memorialChecks(root, [
        ["textReviewed", "已逐项核查生平与追思文字"],
        ["portraitReviewed", "已查看纪念照片及其使用范围"],
        ["rightsReviewed", "已核对有效授权状态与本次公开范围"],
      ]);
    for (const [status, label] of item.status === "pending_review"
      ? [
          ["published", "审核通过"],
          ["rejected", "退回修改"],
          ["hidden", "停止展示"],
        ]
      : [["hidden", "停止展示"]])
      root.append(
        button(label, async () => {
          await api("/admin/api/memorial/halls/" + id, "POST", {
            status,
            revision: item.revision,
            response: reason(),
            ...read(),
          });
          await loadMemorialConsole();
        }),
      );
    const history = cell("details");
    history.append(cell("summary", "提交确认与处理记录"));
    for (const record of item.submissions || [])
      history.append(cell("pre", JSON.stringify(record, null, 2)));
    for (const record of item.history || [])
      history.append(cell("pre", JSON.stringify(record, null, 2)));
    root.append(history);
  }
}
async function loadMemorialConsole() {
  const root = document.getElementById("memorial-console-body");
  root.replaceChildren();
  try {
    const qualification = canAdmin("qualification") && !canAdmin("operations");
    const data = await api(
      "/admin/api/memorial/queue?scope=" +
        (qualification ? "authorization" : "content") +
        "&page=" +
        memorialPage,
    );
    const render = (items, qualify) => {
      for (const item of items.slice(0, 20)) {
        const card = row(
          root,
          item.name || item.payload?.name || "纪念馆记录",
          item.id + " · " + item.status,
        );
        const detail = cell("div");
        card.append(
          button(
            qualify ? "读取授权材料与核验记录" : "读取资料与审核记录",
            () => memorialDetail(detail, item.id, qualify),
          ),
          detail,
        );
      }
    };
    render(
      qualification ? data.authorizations || [] : data.halls || [],
      qualification,
    );
    if (canAdmin("qualification") && canAdmin("operations")) {
      const authorizations = await api(
        "/admin/api/memorial/queue?scope=authorization&page=" + memorialPage,
      );
      root.append(cell("h3", "授权核验"));
      render(authorizations.authorizations || [], true);
    }
    for (const report of data.reports || []) {
      const card = row(
          root,
          "纪念馆核查请求",
          report.hall_id,
          report.kind + " · " + report.reason,
        ),
        reason = memorialReason(card),
        hide = memorialChecks(card, [["hide", "核实后同时隐藏公开纪念馆"]]);
      const detail = cell("div");
      card.append(detail);
      card.append(
        button("读取关联纪念资料", () =>
          memorialDetail(detail, report.hall_id, false),
        ),
      );
      for (const [status, label] of [
        ["resolved", "记录处理答复"],
        ["rejected", "记录核查说明"],
      ])
        card.append(
          button(label, async () => {
            await api("/admin/api/memorial/reports/" + report.id, "POST", {
              status,
              revision: report.revision,
              response: reason(),
              ...hide(),
            });
            await loadMemorialConsole();
          }),
        );
    }
    const paging = cell("div", "", "actions");
    if (memorialPage > 1)
      paging.append(
        button("上一页", () => {
          memorialPage--;
          return loadMemorialConsole();
        }),
      );
    const list = qualification ? data.authorizations : data.halls;
    if (list?.length > 20)
      paging.append(
        button("下一页", () => {
          memorialPage++;
          return loadMemorialConsole();
        }),
      );
    root.append(paging);
  } catch (error) {
    root.append(cell("p", "纪念馆工作区读取失败：" + error.message));
  }
}
