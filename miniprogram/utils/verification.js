'use strict';
const api=require('./api');
async function selectProject(categoryId){const status=await api.request('GET','/api/v1/me/trust',null,true);const target='/pages/publish-form/index?categoryId='+encodeURIComponent(categoryId);if(status.phoneVerified||status.localTestOnly)wx.navigateTo({url:target});else wx.navigateTo({url:'/pages/verification/index?categoryId='+encodeURIComponent(categoryId)});}
function open(){wx.navigateTo({url:'/pages/verification/index'});}
module.exports={selectProject,open};
