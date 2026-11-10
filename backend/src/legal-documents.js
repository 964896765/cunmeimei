'use strict';
const crypto=require('node:crypto'),{ApiError}=require('./rules');
const BRAND='青方睐村美美',TERMS='terms-1.0-20261103',PRIVACY='privacy-1.0-20261103';
function documents(config={}){
 const operatorName=String(config.operatorName||process.env.PLATFORM_OPERATOR_NAME||'').trim(),contactEmail=String(config.contactEmail||process.env.PRIVACY_CONTACT_EMAIL||'').trim();
 const configured=operatorName.length>=2&&operatorName.length<=120&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
 const operator=operatorName||'运营主体尚待配置',contact=contactEmail||'隐私联系渠道尚待配置';
 const terms=`${BRAND}用户协议\n版本：${TERMS}\n运营主体：${operator}\n\n一、浏览与登录\n游客可以浏览公开内容。收藏、发布、联系、商家及积分权益操作需要微信登录；手机号仅在具体业务需要时另行验证。微信身份关联不等于实名或行业资质。\n\n二、内容和业务\n请发布真实、合法且获得授权的信息，不在公开正文填写个人电话、证件号或无关敏感资料。发布与经营资料须审核；专项业务需逐项目核验。官方指引为平台整理，原始信息以官方来源为准。\n\n三、联系与活动\n联系、业务申请及会话仅向有权限的双方提供；可以撤回、拒绝、屏蔽和举报。活动当前支持免费报名。机构咨询不等于已确认订单，医疗、金融等目录不提供诊疗、处方或金融交易。\n\n四、积分与推广\n积分不能充值、提现、转让或兑换现金。权益按确认时快照、库存和核销规则执行；推广须核验主体、审核素材并再次确认排期及积分价格。开始前取消按原消费退还，开始后争议由运营核查，不保证浏览量。\n\n五、限制、退出与注销\n违法、虚假、侵权或危害他人的行为可被限制，并保留处理说明与申诉入口。退出本机不删除账号。注销须先处理未完成义务；必要账本、审核与业务证据按适用规则保留。\n\n六、联系与争议\n请通过应用内帮助、举报、数据申请或联系${contact}提出问题。依法保障用户权利；本协议不排除法律规定的消费者权利。`;
 const privacy=`${BRAND}隐私政策\n版本：${PRIVACY}\n运营主体：${operator}\n隐私联系：${contact}\n\n一、最少必要信息\n游客浏览不要求登录。微信登录仅向微信交换临时code以关联平台账号；不自动取得头像、昵称或手机号。头像和昵称仅在你主动编辑时保存。手机号需另行明确授权，用于发布和联系等必要业务验证，默认不向他人公开。\n\n二、使用目的\n账号标识用于本人发布、收藏、申请、会话和权益记录及权限校验。城市可手动选择；定位只在主动使用相关功能时请求，不默认公开住址。号码加密保存，公开电话需每条信息单独同意，换号或撤回验证会关闭原公开电话。\n\n三、业务与本机记录\n草稿、浏览记录、待核对申请按账号隔离；申请说明和会话仅双方及依法有权限的处理人员可见。不要提交身份证、病历、银行卡或不相关敏感资料。资质流程使用材料工单引用和人工核查，不能以普通资料冒充实名核验。\n\n四、微信与服务端\n微信登录、号码及必要位置能力由微信按其规则提供。AppSecret、session_key等服务端凭据不会下发客户端；应用会话令牌单独生成，服务端保存其哈希。正式通信使用HTTPS。\n\n五、保存、安全与删除\n本机记录可在相应入口清理；账号会话到期或撤销后不能继续访问受限接口。业务、积分及审计证据只按业务目的、争议处理和法定义务保存；运营应配置并公布适用保留期限，到期清理。注销关闭公开信息和联系、清理身份及资料，依法必要的账本和审核证据可能保留，不代表抹去全部历史。\n\n六、你的选择与权利\n你可以继续游客浏览、拒绝或稍后重试授权、手动选择城市、编辑资料、撤回号码公开与验证、屏蔽联系、导出本人数据及申请更正、删除或注销。拒绝某项非必要授权不影响公开浏览。没有实际开通的验证方式不会作为可用替代方案展示。\n\n七、政策更新与联系\n登录时记录你确认的协议、政策版本和内容摘要。涉及实质变化应重新提示，不以默认勾选代替同意。通过应用内数据请求或${contact}行使权利。`;
 const hash=crypto.createHash('sha256').update(JSON.stringify([operatorName,contactEmail,TERMS,PRIVACY,terms,privacy])).digest('hex');
 return {brand:BRAND,configured,operatorName,contactEmail,termsVersion:TERMS,privacyVersion:PRIVACY,hash,terms,privacy};
}
function consent(v,docs){if(!docs.configured)throw new ApiError(503,'LEGAL_NOT_CONFIGURED','运营主体与隐私联系渠道尚未配置，请稍后重试或继续浏览');if(v.consent!==true||v.termsVersion!==docs.termsVersion||v.privacyVersion!==docs.privacyVersion||v.legalHash!==docs.hash)throw new ApiError(400,'LEGAL_CONSENT_REQUIRED','请先阅读并确认当前用户协议和隐私政策');return {termsVersion:docs.termsVersion,privacyVersion:docs.privacyVersion,hash:docs.hash};}
module.exports={documents,consent,BRAND};
