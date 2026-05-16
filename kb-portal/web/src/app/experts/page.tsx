'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  TreeSelect,
} from 'antd';
import {
  ThunderboltOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { getSpaceTree } from '@/api/knowledge-space';
import type { KnowledgeSpaceTreeNode } from '@/types';
import { useAgents, type AgentStatus, type ExpertAgent, type ExpertType } from '@/hooks/useAgents';
import { useExtensions } from '@/hooks/useExtensions';

const { Title, Text, Paragraph } = Typography;

const CATEGORIES = ['全部', '通用', '合规', '审计', '财务', '税务', '其他'];

const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING: { label: '待审核', color: 'orange' },
  PUBLISHED: { label: '已发布', color: 'blue' },
  LISTED: { label: '已上架', color: 'green' },
};

function beautifyPrompt(raw: string): string {
  let text = raw.trim();
  // Remove excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  // Ensure role definition section
  if (!text.includes('你是一位') && !text.includes('你是') && !text.includes('角色')) {
    text = '你是一位专业领域专家。\n\n' + text;
  }
  // Add structure markers for common patterns
  text = text.replace(/(请基于|请根据|请严格|请务必)/g, '\n## 工作要求\n$1');
  text = text.replace(/(回答.*?：|回复.*?：|输出.*?：)/g, '\n## 输出格式\n$1');
  // Ensure ending with quality instruction if missing
  if (!text.includes('无法回答') && !text.includes('不确定') && !text.includes('不知道')) {
    text = text + '\n\n如果问题超出知识范围，请明确说明无法回答，不要编造信息。';
  }
  return text;
}

function buildSpaceOptions(spaces: KnowledgeSpaceTreeNode[]): any[] {
  return spaces.map((space) => ({
    value: space.id,
    title: space.name,
    children: space.children?.length ? buildSpaceOptions(space.children) : undefined,
  }));
}

export default function ExpertsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState('全部');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [spaceTree, setSpaceTree] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ExpertAgent | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const {
    agents,
    addAgent,
    removeAgent,
    submitForReview,
    approveAgent,
    rejectAgent,
    listAgent,
    unlistAgent,
  } = useAgents();
  const { prompts } = useExtensions();

  useEffect(() => {
    getSpaceTree().then(setSpaceTree).catch(() => setSpaceTree([]));
  }, []);

  const filteredAgents = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchKeyword = !keyword
        || agent.name.toLowerCase().includes(keyword)
        || agent.description.toLowerCase().includes(keyword);
      const matchCategory = category === '全部' || agent.category === category;
      return matchKeyword && matchCategory;
    });
  }, [category, agents, searchText]);

  const openCreateDrawer = () => {
    form.resetFields();
    form.setFieldsValue({
      icon: '🤖',
      category: '审计',
      expertType: 'rag',
      systemPrompt: '你是一位资深领域专家，请基于知识库内容给出准确、结构化、可追溯的回答。',
      spaceIds: [],
      promptIds: [],
    });
    setDrawerOpen(true);
  };

  const [expertType, setExpertType] = useState<ExpertType>('rag');

  const saveAgent = async (status: AgentStatus) => {
    const values = await form.validateFields();
    const agent = addAgent({
      name: values.name,
      description: values.description,
      icon: values.icon || '🤖',
      category: values.category || '其他',
      systemPrompt: values.systemPrompt,
      spaceIds: values.spaceIds || [],
      skillIds: values.promptIds || [],
      expertType: values.expertType || 'rag',
      publishNote: values.publishNote,
    }, status);
    setDrawerOpen(false);
    message.success(status === 'PENDING' ? '专家已提交审核' : '专家草稿已保存');
    return agent;
  };

  const handleBeautify = useCallback(() => {
    const current = form.getFieldValue('systemPrompt') || '';
    if (!current.trim()) return;
    form.setFieldsValue({ systemPrompt: beautifyPrompt(current) });
    message.success('提示词已美化');
  }, [form, message]);

  const handlePromptSelect = useCallback((selectedIds: string[]) => {
    if (!selectedIds.length) return;
    const currentPrompt = form.getFieldValue('systemPrompt') || '';
    // Append selected prompt contents to the system prompt
    const appended = selectedIds
      .map((id) => prompts.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `\n\n## 引用提示词：${p!.name}\n${p!.content || ''}`)
      .join('');
    form.setFieldsValue({ systemPrompt: currentPrompt + appended });
  }, [form, prompts]);

  const openRejectModal = (agent: ExpertAgent) => {
    setRejectTarget(agent);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const confirmReject = () => {
    if (rejectTarget) {
      rejectAgent(rejectTarget.id, rejectReason || '未填写驳回原因');
      message.success('已驳回，状态回到草稿');
    }
    setRejectModalOpen(false);
    setRejectTarget(null);
  };

  const startChat = (agent: ExpertAgent) => {
    router.push(`/agent/${agent.id}/chat`);
  };

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>专家中心</Title>
          <Text type="secondary">选择领域 AI 专家，进入带专家提示词和知识空间上下文的专属对话。</Text>
        </div>
        <Space>
          <Button icon={<UserOutlined />} onClick={() => router.push('/experts/mine')}>我的专家</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>创建专家</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 18 }}>
        <Space wrap size={12}>
          <Input
            placeholder="搜索专家..."
            prefix={<SearchOutlined />}
            allowClear
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
          />
          <Select
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((item) => ({ label: item, value: item }))}
            style={{ width: 140 }}
          />
        </Space>
      </Card>

      {filteredAgents.length === 0 ? (
        <Empty description="暂无专家" style={{ marginTop: 80 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredAgents.map((agent) => (
            <Card key={agent.id} hoverable style={{ borderRadius: 8 }} styles={{ body: { padding: 20 } }}>
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 210 }}>
                <Space align="start" size={14}>
                  <div style={{ width: 54, height: 54, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--color-muted)', fontSize: 30 }}>
                    {agent.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Title level={5} style={{ margin: 0 }}>{agent.name}</Title>
                    <Space size={6} style={{ marginTop: 8 }}>
                      <Tag color="blue">{agent.category}</Tag>
                      <Tag color={STATUS_META[agent.status].color}>{STATUS_META[agent.status].label}</Tag>
                    </Space>
                  </div>
                </Space>
                <Paragraph ellipsis={{ rows: 3 }} style={{ margin: '18px 0', color: 'var(--color-secondary)' }}>
                  {agent.description}
                </Paragraph>
                <div style={{ marginTop: 'auto' }}>
                  <Space wrap style={{ marginBottom: 16 }}>
                    <Tag color={agent.expertType === 'assistant' ? 'purple' : 'blue'}>{agent.expertType === 'assistant' ? '助手' : 'RAG'}</Tag>
                    <Tag>绑定空间 {agent.spaceIds.length}</Tag>
                  </Space>
                  <Space wrap size={6}>
                    {(agent.status === 'PUBLISHED' || agent.status === 'LISTED') && (
                      <Button type="primary" onClick={() => startChat(agent)}>开始对话</Button>
                    )}
                    {agent.status === 'DRAFT' && (
                      <>
                        <Button size="small" icon={<SendOutlined />} type="primary" onClick={() => { submitForReview(agent.id, agent.publishNote); message.success('已提交审核'); }}>提交审核</Button>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeAgent(agent.id)}>删除</Button>
                      </>
                    )}
                    {agent.status === 'PENDING' && (
                      <>
                        <Button size="small" icon={<CheckCircleOutlined />} type="primary" onClick={() => { approveAgent(agent.id); message.success('审核已通过'); }}>审核通过</Button>
                        <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(agent)}>驳回</Button>
                      </>
                    )}
                    {agent.status === 'PUBLISHED' && (
                      <Button size="small" type="primary" onClick={() => { listAgent(agent.id); message.success('专家已上架'); }}>上架</Button>
                    )}
                    {agent.status === 'LISTED' && (
                      <Button size="small" onClick={() => { unlistAgent(agent.id); message.success('专家已下架'); }}>下架</Button>
                    )}
                  </Space>
                </div>
              </div>
            </Card>
          ))}
          <Card hoverable style={{ borderRadius: 8, borderStyle: 'dashed' }} styles={{ body: { padding: 20, minHeight: 250 } }} onClick={openCreateDrawer}>
            <div style={{ height: '100%', minHeight: 210, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 34, marginBottom: 12 }}>＋</div>
                <Title level={5} style={{ marginBottom: 6 }}>创建你的专属 AI 专家</Title>
                <Text type="secondary">配置提示词、知识空间和发布说明</Text>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal
        title="驳回原因"
        open={rejectModalOpen}
        onOk={confirmReject}
        onCancel={() => { setRejectModalOpen(false); setRejectTarget(null); }}
        okText="驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={3}
          placeholder="请输入驳回原因"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          style={{ marginTop: 12 }}
        />
      </Modal>

      <Drawer
        title="创建专家"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => saveAgent('DRAFT')}>保存草稿</Button>
            <Button type="primary" onClick={() => saveAgent('PENDING')}>提交审核</Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="专家名称" rules={[{ required: true, message: '请输入专家名称' }]}>
            <Input placeholder="如：合规审查专家" />
          </Form.Item>
          <Form.Item name="description" label="一句话描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={2} placeholder="专注企业合规风险识别与法规对照分析" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="icon" label="图标" style={{ width: 120 }}>
              <Input placeholder="🤖" />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ width: '100%' }} rules={[{ required: true, message: '请选择分类' }]}>
              <Select options={CATEGORIES.filter((item) => item !== '全部').map((item) => ({ label: item, value: item }))} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="expertType" label="专家类型" rules={[{ required: true, message: '请选择专家类型' }]}>
            <Select
              options={[
                { label: 'RAG 专家 — 基于知识库检索回答，提供带引用的可信答案', value: 'rag' },
                { label: '助手专家 — 直接与大模型对话，不检索知识库', value: 'assistant' },
              ]}
              onChange={(value: ExpertType) => {
                setExpertType(value);
                if (value === 'assistant') {
                  form.setFieldsValue({
                    systemPrompt: '你是一个智能助手，请直接回答用户的问题。回答应准确、有条理、简洁明了。',
                    spaceIds: [],
                  });
                } else {
                  form.setFieldsValue({
                    systemPrompt: '你是一位资深领域专家，请基于知识库内容给出准确、结构化、可追溯的回答。',
                  });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: '请输入系统提示词' }]}>
            <Input.TextArea rows={10} placeholder="你是一位资深企业合规顾问，擅长..." />
          </Form.Item>
          <Form.Item style={{ marginTop: -16 }}>
            <Button icon={<ThunderboltOutlined />} onClick={handleBeautify} size="small">美化提示词</Button>
          </Form.Item>
          <Form.Item name="promptIds" label="引用技能中心提示词">
            <Select
              mode="multiple"
              placeholder="选择提示词模板，选中后自动追加到系统提示词"
              options={prompts.map((p) => ({ label: `${p.icon || '📝'} ${p.name}`, value: p.id }))}
              onChange={handlePromptSelect}
              allowClear
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          {expertType === 'rag' && (
            <Form.Item name="spaceIds" label="绑定知识空间">
              <TreeSelect
                treeData={buildSpaceOptions(spaceTree)}
                treeCheckable
                showCheckedStrategy={TreeSelect.SHOW_PARENT}
                placeholder="可选，默认检索全部知识库"
                style={{ width: '100%' }}
                treeDefaultExpandAll
              />
            </Form.Item>
          )}
          <Form.Item name="publishNote" label="发布说明">
            <Input.TextArea rows={3} placeholder="说明用途、适用用户和审核关注点" />
          </Form.Item>
        </Form>
      </Drawer>
    </AppLayout>
  );
}
