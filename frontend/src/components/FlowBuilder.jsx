import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getLang, Localized, translate, useLang } from '../i18n';

// Same-origin default works in hosted previews and production; set VITE_API_URL only for a separately hosted API.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const nodeInfo = {
  trigger: { title: 'Trigger', content: 'কোন মেসেজ এলে ফ্লো চালু হবে?', icon: '⚡', color: '#f59e0b' },
  message: { title: 'Text Message', content: 'এখানে আপনার মেসেজ লিখুন...', icon: '💬', color: '#38bdf8' },
  condition: { title: 'Condition (If / Else)', content: 'শর্ত লিখুন', icon: '🔀', color: '#c084fc' },
  delay: { title: 'Delay', content: 'অপেক্ষার সময়: ৫ সেকেন্ড', icon: '⏱️', color: '#34d399' },
  ai_reply: { title: 'AI Reply (Python)', content: 'উত্তর সংক্ষিপ্ত, সহায়ক এবং গ্রাহকের ভাষায় দিন।', icon: '🤖', color: '#10b981' },
  intent: { title: 'Intent Detection (Python)', content: 'pricing,order,support,complaint,human,other', icon: '🧠', color: '#a78bfa' },
};
const defaultNodes = language => [
  { id:'trigger-1', type:'flowNode', position:{x:180,y:60}, data:{kind:'trigger',title:translate('Incoming message',language),content:translate('Keyword trigger',language),keyword:'price'} },
  { id:'message-1', type:'flowNode', position:{x:180,y:240}, data:{kind:'message',title:translate('Auto reply',language),content:translate('ধন্যবাদ আমাদের নক করার জন্য!',language)} },
];
const defaultEdges = [{id:'e-trigger-message',source:'trigger-1',target:'message-1',animated:true}];

function authHeaders() {
  const token = localStorage.getItem('flowbot_token') || localStorage.getItem('token') || '';
  return { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) };
}
async function api(path, options={}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers:{...authHeaders(), ...(options.headers||{})} });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
function FlowNode({data,selected}) {
  const info=nodeInfo[data.kind]||nodeInfo.message;
  return <div style={{width:250,background:'#0f172a',color:'#e2e8f0',border:`2px solid ${selected?info.color:'#334155'}`,borderRadius:12,boxShadow:selected?`0 0 16px ${info.color}35`:'0 6px 18px #0005',fontFamily:'inherit'}}>
    <Handle type="target" position={Position.Top} style={{background:'#cbd5e1',width:10,height:10}}/>
    <div style={{padding:'10px 12px',borderBottom:'1px solid #334155',display:'flex',gap:8,alignItems:'center'}}><span>{info.icon}</span><strong data-no-translate={!!data.title} style={{fontSize:12,color:info.color}}>{data.title||info.title}</strong></div>
    <div style={{padding:12,fontSize:12,lineHeight:1.6}}><div style={{color:'#94a3b8',marginBottom:5}}>{String(data.kind||'message').toUpperCase()}</div>
      {data.kind==='trigger'&&<div style={{color:'#fbbf24',marginBottom:5}}>Keyword: {data.keyword||'(not set)'}</div>}
      <div data-no-translate style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{data.content}</div>
      {data.kind==='condition'&&<div style={{marginTop:8,color:'#c084fc'}}>YES / NO edges</div>}
      {data.kind==='delay'&&<div style={{color:'#34d399'}}>Delay: {Number(data.seconds||5)} seconds</div>}
      {data.kind==='ai_reply'&&<div style={{color:'#10b981'}}>Requires configured Python AI provider</div>}
      {data.kind==='intent'&&<div style={{color:'#a78bfa'}}>Edges can be labeled with intent names</div>}
    </div><Handle type="source" position={Position.Bottom} style={{background:info.color,width:10,height:10}}/>
  </div>;
}
const fieldStyle={boxSizing:'border-box',width:'100%',marginTop:6,marginBottom:12,padding:9,background:'#0f172a',color:'#e2e8f0',border:'1px solid #334155',borderRadius:7,fontSize:12};
const labelStyle={display:'block',fontSize:12,marginTop:8,color:'#94a3b8'};
const buttonStyle={padding:'9px 12px',border:'1px solid #475569',borderRadius:8,background:'#1e293b',color:'#e2e8f0',cursor:'pointer',fontSize:12,fontWeight:600};

function BuilderCanvas() {
  const { lang }=useLang({bn:{},en:{}});
  const t=key=>translate(key,lang);
  const [nodes,setNodes,onNodesChange]=useNodesState(()=>defaultNodes(getLang()));
  const [edges,setEdges,onEdgesChange]=useEdgesState(defaultEdges);
  const [selectedNodeId,setSelectedNodeId]=useState('message-1');
  const [flows,setFlows]=useState([]);
  const [flowId,setFlowId]=useState('');
  const [channelId,setChannelId]=useState(localStorage.getItem('flowbot_channel_id')||'');
  const [flowName,setFlowName]=useState(()=>lang==='bn'?'নতুন Automation':'New Automation');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const selectedNode=nodes.find(n=>n.id===selectedNodeId);
  const nodeTypes=useMemo(()=>({flowNode:FlowNode}),[]);
  const {fitView}=useReactFlow();

  const loadFlows=useCallback(async()=>{
    if(!channelId){setFlows([]);return;}
    try{const data=await api(`/flows/${encodeURIComponent(channelId)}`);setFlows(Array.isArray(data)?data:[]);}
    catch(e){setStatus(e.message);}
  },[channelId]);
  useEffect(()=>{loadFlows();},[loadFlows]);

  const selectFlow=useCallback((flow)=>{
    setFlowId(String(flow.id));setFlowName(flow.name||'Untitled flow');
    const d=flow.flow_data||{};
    if(Array.isArray(d.nodes)&&d.nodes.length){setNodes(d.nodes);setEdges(Array.isArray(d.edges)?d.edges:[]);}
    else {setNodes([{id:'trigger-1',type:'flowNode',position:{x:180,y:60},data:{kind:'trigger',title:'Keyword trigger',content:'Incoming message',keyword:flow.trigger_keyword||''}},{id:'message-1',type:'flowNode',position:{x:180,y:240},data:{kind:'message',title:'Auto reply',content:d.replyText||''}}]);setEdges([{id:'e-trigger-message',source:'trigger-1',target:'message-1',animated:true}]);}
    setSelectedNodeId('');setDirty(false);setStatus(lang==='bn'?`"${flow.name}" লোড হয়েছে`:`"${flow.name}" loaded`);
    setTimeout(()=>fitView({padding:.2}),0);
  },[setNodes,setEdges,fitView,lang]);

  const onConnect=useCallback(connection=>{setEdges(es=>addEdge({...connection,id:`e-${connection.source}-${connection.target}-${Date.now()}`,animated:true,style:{stroke:'#f59e0b',strokeWidth:2}},es));setDirty(true);},[setEdges]);
  const addNode=(kind)=>{
    const info=nodeInfo[kind],id=`${kind}-${crypto.randomUUID?.()||Date.now()}`;
    setNodes(ns=>[...ns,{id,type:'flowNode',position:{x:100+Math.round(Math.random()*180),y:100+ns.length*70},data:{kind,title:translate(info.title,lang),content:translate(info.content,lang),...(kind==='trigger'?{keyword:''}:{}),...(kind==='delay'?{seconds:5}:{})}}]);
    setSelectedNodeId(id);setDirty(true);
  };
  const updateNode=(field,value)=>{
    if(!selectedNode)return;
    setNodes(ns=>ns.map(n=>n.id===selectedNode.id?{...n,data:{...n.data,[field]:value}}:n));setDirty(true);
  };
  const removeNode=()=>{
    if(!selectedNode)return;
    setNodes(ns=>ns.filter(n=>n.id!==selectedNode.id));
    setEdges(es=>es.filter(e=>e.source!==selectedNode.id&&e.target!==selectedNode.id));
    setSelectedNodeId('');setDirty(true);
  };
  const saveFlow=async(publish=false)=>{
    if(!channelId){setStatus(t('Please enter a channel ID first. The channel ID must belong to a connected channel.'));return;}
    if(!flowName.trim()){setStatus(t('Enter a flow name.'));return;}
    if(!nodes.length||!nodes.some(n=>n.data?.kind==='trigger')){setStatus(t('At least one Trigger node is required.'));return;}
    const invalid=nodes.find(n=>n.data?.kind==='message'&&!String(n.data.content||'').trim());
    if(invalid){setStatus(lang==='bn'?`"${invalid.data.title||'Message'}" নোডে মেসেজ লিখুন।`:`Add a message to the "${invalid.data.title||'Message'}" node.`);return;}
    setBusy(true);setStatus('');
    try{
      const normalizedNodes=nodes.map(n=>n.data?.kind==='intent'?{...n,data:{...n.data,intents:String(n.data.content||'pricing,order,support,complaint,human,other').split(',').map(x=>x.trim()).filter(Boolean)}}:n);
      const body={channel_id:Number(channelId),name:flowName.trim(),flow_data:{version:1,nodes:normalizedNodes,edges},trigger_type:'keyword',trigger_keyword:nodes.find(n=>n.data?.kind==='trigger')?.data?.keyword||'',is_active:publish};
      const saved=flowId
        ? await api(`/flows/${encodeURIComponent(flowId)}`,{method:'PUT',body:JSON.stringify(body)})
        : await api('/flows',{method:'POST',body:JSON.stringify(body)});
      setFlowId(String(saved.id));setDirty(false);
      setStatus(publish?t('Flow published.') :t('Flow saved.'));
      await loadFlows();
    }catch(e){setStatus(e.message);}
    finally{setBusy(false);}
  };
  const createNew=()=>{setFlowId('');setFlowName(lang==='bn'?'নতুন Automation':'New Automation');setNodes(defaultNodes(lang));setEdges(defaultEdges);setSelectedNodeId('message-1');setDirty(true);setStatus(t('New flow created. Save it.'));};
  const deleteFlow=async()=>{
    if(!flowId||!window.confirm(t('Delete this flow?')))return;
    setBusy(true);try{await api(`/flows/${encodeURIComponent(flowId)}`,{method:'DELETE'});createNew();await loadFlows();setStatus(t('Flow deleted.'));}catch(e){setStatus(e.message);}finally{setBusy(false);}
  };

  return <Localized><div className="flow-builder-shell" style={{display:'flex',width:'100%',height:'min(calc(100vh - 170px), 900px)',minHeight:560,background:'#0f172a',color:'#e2e8f0',overflow:'hidden',fontFamily:'inherit'}}>
    <aside className="flow-builder-sidebar" style={{width:290,minWidth:250,padding:14,background:'#020617',borderRight:'1px solid #334155',overflowY:'auto',boxSizing:'border-box'}}>
      <h2 style={{fontSize:19,margin:'0 0 5px'}}>⚡ Flow Builder</h2><p style={{fontSize:12,color:'#94a3b8'}}>{t('নোড যোগ করুন, সংযোগ দিন, তারপর Save/Publish করুন।')}</p>
      <label style={labelStyle}>Channel ID</label><div style={{display:'flex',gap:6}}><input value={channelId} onChange={e=>setChannelId(e.target.value)} placeholder="Connected channel ID" style={{...fieldStyle,flex:1,minWidth:0}}/><button style={buttonStyle} onClick={()=>{localStorage.setItem('flowbot_channel_id',channelId);loadFlows();}}>Load</button></div>
      <label style={labelStyle}>Flow name</label><input value={flowName} onChange={e=>{setFlowName(e.target.value);setDirty(true);}} style={fieldStyle}/>
      <label style={labelStyle}>Saved flows</label><select value={flowId} onChange={e=>{const f=flows.find(x=>String(x.id)===e.target.value);if(f)selectFlow(f);}} style={fieldStyle}><option value="">— Current / New flow —</option>{flows.map(f=><option key={f.id} value={f.id}>{f.name} {f.is_active?'(Published)':'(Draft)'}</option>)}</select>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}><button style={buttonStyle} onClick={createNew}>＋ New</button><button style={buttonStyle} disabled={busy} onClick={()=>saveFlow(false)}>{busy?'Saving…':'Save draft'}</button><button style={{...buttonStyle,background:'#065f46'}} disabled={busy} onClick={()=>saveFlow(true)}>Publish</button>{flowId&&<button style={{...buttonStyle,background:'#7f1d1d'}} disabled={busy} onClick={deleteFlow}>Delete</button>}</div>
      <div style={{fontSize:12,color:dirty?'#fbbf24':'#86efac',marginBottom:8}}>{dirty?'● '+t('Unsaved changes'):'✓ '+t('All changes saved')}</div>
      {status&&<div role="status" style={{fontSize:12,padding:9,marginBottom:12,borderRadius:8,background:'#1e293b',color:'#cbd5e1',overflowWrap:'anywhere'}}>{status}</div>}
      <div style={{borderTop:'1px solid #334155',paddingTop:14}}><h3 style={{fontSize:14,color:'#fbbf24'}}>＋ Elements</h3>{Object.entries(nodeInfo).map(([kind,info])=><button key={kind} onClick={()=>addNode(kind)} style={{...buttonStyle,display:'flex',alignItems:'center',gap:10,width:'100%',marginBottom:8,textAlign:'left'}}><span style={{fontSize:18}}>{info.icon}</span>{info.title}</button>)}</div>
      <div style={{borderTop:'1px solid #334155',marginTop:16,paddingTop:14}}><h3 style={{fontSize:14,color:'#fbbf24'}}>⚙ Node settings</h3>{selectedNode?<><label style={labelStyle}>নোডের নাম</label><input value={selectedNode.data.title||''} onChange={e=>updateNode('title',e.target.value)} style={fieldStyle}/>
        {selectedNode.data.kind==='trigger'&&<><label style={labelStyle}>Trigger keyword (exact match)</label><input value={selectedNode.data.keyword||''} onChange={e=>updateNode('keyword',e.target.value)} placeholder="price" style={fieldStyle}/></>}
        {selectedNode.data.kind==='delay'&&<><label style={labelStyle}>Delay (seconds, max 3600)</label><input type="number" min="1" max="3600" value={selectedNode.data.seconds||5} onChange={e=>updateNode('seconds',Math.max(1,Math.min(3600,Number(e.target.value)||1)))} style={fieldStyle}/></>}
        {selectedNode.data.kind==='ai_reply'&&<><label style={labelStyle}>AI instructions / system prompt</label><textarea value={selectedNode.data.systemPrompt||selectedNode.data.content||''} onChange={e=>updateNode('systemPrompt',e.target.value)} rows={4} style={{...fieldStyle,resize:'vertical'}}/></>}
        {selectedNode.data.kind!=='ai_reply'&&<><label style={labelStyle}>{selectedNode.data.kind==='condition'?'Condition keyword':selectedNode.data.kind==='message'?'Message text':selectedNode.data.kind==='intent'?'Intent labels (comma-separated)':'Description'}</label><textarea value={selectedNode.data.content||''} onChange={e=>updateNode('content',e.target.value)} rows={5} style={{...fieldStyle,resize:'vertical'}}/></>}
        <button onClick={removeNode} style={{...buttonStyle,width:'100%',background:'#7f1d1d'}}>🗑 Selected node delete</button>
      </>:<p style={{fontSize:12,color:'#94a3b8'}}>Canvas থেকে একটি node নির্বাচন করুন।</p>}</div>
    </aside>
    <main style={{flex:1,minWidth:0,height:'100%',background:'#111827'}}><div style={{padding:'12px 16px',background:'#020617',borderBottom:'1px solid #334155',fontSize:12,color:'#cbd5e1'}}>Canvas: node টেনে সরান এবং Handle থেকে Handle-এ connection তৈরি করুন। Condition-এর outgoing edge label-এ yes/no লিখতে edge select করুন।</div>
      <div style={{height:'calc(100% - 42px)'}}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes=>{onNodesChange(changes);if(changes.some(c=>c.type==='position'||c.type==='remove'))setDirty(true);}} onEdgesChange={changes=>{onEdgesChange(changes);if(changes.length)setDirty(true);}} onConnect={onConnect} onNodeDragStop={()=>setDirty(true)} onNodeClick={(_,n)=>setSelectedNodeId(n.id)} onEdgeClick={(_,edge)=>{const label=window.prompt('Connection label (condition branch: yes/no):',String(edge.label||''));if(label!==null){setEdges(es=>es.map(e=>e.id===edge.id?{...e,label,labelStyle:{fill:'#e2e8f0'},style:{stroke:'#f59e0b',strokeWidth:2}}:e));setDirty(true);}}} onPaneClick={()=>setSelectedNodeId('')} fitView deleteKeyCode={['Backspace','Delete']} proOptions={{hideAttribution:true}}><Background color="#334155" gap={20}/><Controls/><MiniMap nodeColor={n=>(nodeInfo[n.data?.kind]||nodeInfo.message).color} style={{background:'#020617'}}/></ReactFlow></div>
    </main>
  </div></Localized>;
}
export default function FlowBuilder(){return <ReactFlowProvider><BuilderCanvas/></ReactFlowProvider>;}
