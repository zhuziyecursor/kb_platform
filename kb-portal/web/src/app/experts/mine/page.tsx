'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  TreeSelect,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import AppLayout from '@/components/AppLayout';
import { getSpaceTree } from '@/api/knowledge-space';
import type { KnowledgeSpaceTreeNode } from '@/types';
import { useAgents, type AgentStatus, type ExpertAgent, type ExpertType } from '@/hooks/useAgents';
import { useExtensions } from '@/hooks/useExtensions';

const { Title, Text } = Typography;

const CATEGORIES = ['通用', '合规', '审计', '财务', '税务', '其他'];
const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING: { label: '待审核', color: 'orange' },
  PUBLISHED: { label: '已发布', color: 'blue' },
  LISTED: { label: '已上架', color: 'green' },
};

function beautifyPrompt(raw: string): string {
  let text = raw.trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  if (!text.includes('你是一位') && !text.includes('你是') && !text.includes('角色')) {
    text = '你是一位专业领域专家。\n\n' + text;
  }
  text = text.replace(/(请基于|请根据|请严格|请务必)/g, '\n## 工作要求\n$1');
  text = text.replace(/(回答.*?：|回复.*?：|输出.*?：)/g, '\n## 输出格式\n$1');
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

export default function MyExpertsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ExpertAgent | null>(null);
  const [expertType, setExpertType] = useState<ExpertType>('rag');
  const [spaceTree, setSpaceTree] = useState<KnowledgeSpaceTreeNode[]>([]);

  const {
    agents,
    addAgent,
    updateAgent,
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

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf()),
    [agents]
  );

  const openCreate = () => {
    setEditingAgent(null);
    setExpertType('rag');
    form.resetFields();
    form.setFieldsValue({
      icon: '🤖',
      category: '审计',
      expertType: 'rag',
      spaceIds: [],
      promptIds: [],
      systemPrompt: '你是一位资深领域专家，请基于知识库内容给出准确、结构化、可追溯的回答。',
    });
    setDrawerOpen(true);
  };

  const openEdit = (agent: ExpertAgent) => {
    setEditingAgent(agent);
    setExpertType(agent.expertType || 'rag');
    form.setFieldsValue({ ...agent, promptIds: agent.skillIds || [] });
    setDrawerOpen(true);
  };

  const saveAgent = async (status?: AgentStatus) => {
    const values = await form.validateFields();
    if (editingAgent) {
      updateAgent(editingAgent.id, {
        name: values.name,
        description: values.description,
        icon: values.icon || '🤖',
        category: values.category || '其他',
        systemPrompt: values.systemPrompt,
        spaceIds: values.spaceIds || [],
        skillIds: values.promptIds || [],
        expertType: values.expertType || 'rag',
        publishNote: values.publishNote,
        status: status || editingAgent.status,
      });
      if (status === 'PENDING') submitForReview(editingAgent.id, values.publishNote);
    } else {
      addAgent({
        name: values.name,
        description: values.description,
        icon: values.icon || '🤖',
        category: values.category || '其他',
        systemPrompt: values.systemPrompt,
        spaceIds: values.spaceIds || [],
        skillIds: values.promptIds || [],
        expertType: values.expertType || 'rag',
        publishNote: values.publishNote,
      }, status || 'DRAFT');
    }
    setDrawerOpen(false);
    message.success(status === 'PENDING' ? '专家已提交审核' : '专家已保存');
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
    const appended = selectedIds
      .map((id) => prompts.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `\n\n## 引用提示词：${p!.name}\n${p!.content || ''}`)
      .join('');
    form.setFieldsValue({ systemPrompt: currentPrompt + appended });
  }, [form, prompts]);

  const rejectWithReason = (agent: ExpertAgent) => {
    Modal.confirm({
      title: '驳回原因',
      content: (
        <Input.TextArea
          id="agent-reject-reason"
          rows={3}
          placeholder="请输入驳回原因"
          style={{ marginTop: 12 }}
        />
      ),
      okText: '驳回',
      cancelText: '取消',
      onOk: () => {
        const value = (document.getElementById('agent-reject-reason') as HTMLTextAreaElement | null)?.value;
        rejectAgent(agent.id, value || '未填写驳回原因');
        message.success('已驳回，状态回到草稿');
      },
    });
  };

  const columns: ColumnsType<ExpertAgent> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_, agent) => (
        <Space>
          <span style={{ fontSize: 22 }}>{agent.icon}</span>
          <div>
            <Text strong>{agent.name}</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>{agent.description}</Text></div>
          </div>
        </Space>
      ),
    },
    { title: '分类', dataIndex: 'category', width: 90, render: (value) => <Tag color="blue">{value}</Tag> },
    { title: '状态', dataIndex: 'status', width: 100, render: (status: AgentStatus) => <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 150, render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      width: 310,
      render: (_, agent) => (
        <Space wrap size={6}>
          {(agent.status === 'PUBLISHED' || agent.status === 'LISTED') && (
            <Button size="small" onClick={() => router.push(`/agent/${agent.id}/chat`)}>对话</Button>
          )}
          {agent.status === 'DRAFT' && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(agent)}>编辑</Button>
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => { submitForReview(agent.id, agent.publishNote); message.success('已提交审核'); }}>提交</Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeAgent(agent.id)}>删除</Button>
            </>
          )}
          {agent.status === 'PENDING' && (
            <>
              <Button size="small" icon={<CheckCircleOutlined />} onClick={() => { approveAgent(agent.id); message.success('审核已通过'); }}>审核通过</Button>
              <Button size="small" danger onClick={() => rejectWithReason(agent)}>驳回</Button>
            </>
          )}
          {agent.status === 'PUBLISHED' && (
            <Button size="small" type="primary" onClick={() => { listAgent(agent.id); message.success('专家已上架'); }}>上架</Button>
          )}
          {agent.status === 'LISTED' && (
            <Button size="small" onClick={() => { unlistAgent(agent.id); message.success('专家已下架'); }}>下架</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/experts')}>返回广场</Button>
          <div>
            <Title level={4} style={{ margin: 0 }}>我的专家</Title>
            <Text type="secondary">管理专家草稿、审核、发布和上架状态。</Text>
          </div>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建专家</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={sortedAgents}
        pagination={{ pageSize: 8 }}
      />

      <Drawer
        title={editingAgent ? '编辑专家' : '创建专家'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => saveAgent()}>保存草稿</Button>
            <Button type="primary" onClick={() => saveAgent('PENDING')}>提交审核</Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="专家名称" rules={[{ required: true, message: '请输入专家名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="一句话描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="icon" label="图标" style={{ width: 120 }}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ width: '100%' }}>
              <Select options={CATEGORIES.map((item) => ({ label: item, value: item }))} />
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
            <Input.TextArea rows={10} />
          </Form.Item>
          <Form.Item style={{ marginTop: -16 }}>
            <Button icon={<ExperimentOutlined />} onClick={handleBeautify} size="small">美化提示词</Button>
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
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </AppLayout>
  );
}
