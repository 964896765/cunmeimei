const shortcuts=require('../../utils/shortcuts'),registry=require('../../utils/classification');
Page({
 data:{editing:false,selectedIds:[],options:[],max:shortcuts.max,iconPalette:'prism'},
 onLoad(o={}){this.setData({editing:o.mode==='edit'});this.refresh(shortcuts.load());},onShow(){require('../../utils/theme').apply(this);},
 open(e){if(this.data.editing)return this.toggle(e);require('../../utils/navigation').discoverIndustry(e.currentTarget.dataset.id);},
 back(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/home/index'})});},
 refresh(ids){const selectedIds=shortcuts.normalize(ids);this.setData({selectedIds,options:registry.categoryItems().map(x=>({...x,selected:selectedIds.includes(x.id)}))});},
 toggle(e){const id=e.currentTarget.dataset.id,ids=this.data.selectedIds;if(!this.data.options.some(x=>x.id===id))return;if(!ids.includes(id)&&ids.length>=shortcuts.max){wx.showToast({title:'请先移除一个常用分类',icon:'none'});return;}this.refresh(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);},
 reset(){this.refresh(shortcuts.defaults);},
 save(){shortcuts.save(this.data.selectedIds);this.back();}
});
