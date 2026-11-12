'use strict';

let reviewDialogQueue = Promise.resolve();

function reviewDialog({message, initialValue = '', input = false}) {
  const session = csrf;
  const run = reviewDialogQueue.then(() => new Promise((resolve, reject) => {
    if (session !== csrf) { reject(Error('登录状态已变化，请重新读取审核任务')); return; }
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'review-dialog';
    dialog.setAttribute('aria-labelledby', 'review-dialog-title');
    const form = document.createElement('form');
    form.method = 'dialog';
    const heading = document.createElement('h2');
    heading.id = 'review-dialog-title';
    heading.textContent = input ? '填写处理记录' : '确认处理操作';
    const label = document.createElement(input ? 'label' : 'p');
    label.textContent = message;
    const field = document.createElement('textarea');
    field.id = 'review-dialog-value';
    field.value = String(initialValue ?? '');
    if (input) label.htmlFor = field.id;
    const actions = document.createElement('div');
    actions.className = 'review-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.value = 'confirm';
    confirm.textContent = input ? '保存记录并继续' : '确认操作';
    actions.append(cancel, confirm);
    form.append(heading, label);
    if (input) form.append(field);
    form.append(actions);
    dialog.append(form);
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      const value = input ? confirmed ? field.value : null : confirmed;
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      if (session !== csrf) reject(Error('登录状态已变化，本次操作已取消，请重新读取审核任务'));
      else resolve(value);
    }, {once:true});
    document.body.append(dialog);
    dialog.showModal();
    (input ? field : cancel).focus();
  }));
  reviewDialogQueue = run.catch(() => {});
  return run;
}

function adminPrompt(message, initialValue = '') {
  return reviewDialog({message, initialValue, input:true});
}

function adminConfirm(message) {
  return reviewDialog({message});
}
