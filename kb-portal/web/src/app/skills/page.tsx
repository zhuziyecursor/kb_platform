'use client';

import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import {
  useExtensions,
  type CustomSkill,
  type ExternalSkill,
  type MCPServer,
  type PromptConfig,
  type SkillStatus,
  type ToolboxTool,
} from '@/hooks/useExtensions';

const TOOL_PAGE_TYPES: string[] = ['file-compare'];

const { Title, Text, Paragraph } = Typography;

type SkillKind = 'PROMPT' | 'SKILL' | 'MCP' | 'TOOLBOX';

interface SkillItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  kind: SkillKind;
  status: SkillStatus;
  rejectReason?: string;
  source: 'prompt' | 'external' | 'custom' | 'mcp' | 'toolbox';
  raw: PromptConfig | ExternalSkill | CustomSkill | MCPServer | ToolboxTool;
}

const KIND_OPTIONS = [
  { label: '全部', value: 'ALL' },
  { label: 'Prompt模版', value: 'PROMPT' },
  { label: 'Skills', value: 'SKILL' },
  { label: 'MCP Server', value: 'MCP' },
  { label: '工具箱', value: 'TOOLBOX' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '已启用', value: 'ENABLED' },
];

const STATUS_META: Record<SkillStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING: { label: '待审核', color: 'orange' },
  PUBLISHED: { label: '已发布', color: 'blue' },
  ENABLED: { label: '已启用', color: 'green' },
};

function getStatus(status?: SkillStatus, enabled?: boolean): SkillStatus {
  return status || (enabled ? 'ENABLED' : 'PUBLISHED');
}

function toSkillItems(
  prompts: PromptConfig[],
  externalSkills: ExternalSkill[],
  customSkills: CustomSkill[],
  mcpServers: MCPServer[],
  toolbox: ToolboxTool[]
): SkillItem[] {
  return [
    ...prompts.map((prompt) => ({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      icon: prompt.icon || '📝',
      category: prompt.category || 'Prompt模版',
      kind: 'PROMPT' as const,
      status: getStatus(prompt.status, prompt.enabled),
      rejectReason: prompt.rejectReason,
      source: 'prompt' as const,
      raw: prompt,
    })),
    ...externalSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon || '🔧',
      category: skill.category || 'Skills',
      kind: 'SKILL' as const,
      status: getStatus(skill.status, skill.enabled),
      rejectReason: skill.rejectReason,
      source: 'external' as const,
      raw: skill,
    })),
    ...customSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: '⚙️',
      category: 'Skills',
      kind: 'SKILL' as const,
      status: getStatus(skill.status, skill.enabled),
      rejectReason: skill.rejectReason,
      source: 'custom' as const,
      raw: skill,
    })),
    ...mcpServers.map((server) => ({
      id: server.id,
      name: server.name,
      description: `${server.type.toUpperCase()} MCP Server`,
      icon: '🧩',
      category: 'MCP Server',
      kind: 'MCP' as const,
      status: getStatus(server.status, server.enabled),
      rejectReason: server.rejectReason,
      source: 'mcp' as const,
      raw: server,
    })),
    ...toolbox.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      icon: tool.icon || '🧰',
      category: tool.category || '工具箱',
      kind: 'TOOLBOX' as const,
      status: getStatus(tool.status, tool.enabled),
      rejectReason: tool.rejectReason,
      source: 'toolbox' as const,
      raw: tool,
    })),
  ];
}

export default function SkillsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | SkillKind>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SkillStatus>('ALL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState(0);
  const [editingItem, setEditingItem] = useState<SkillItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<SkillItem | null>(null);

  const {
    prompts,
    externalSkills,
    customSkills,
    mcpServers,
    toolbox,
    addPrompt,
    updatePrompt,
    removePrompt,
    submitPromptForReview,
    approvePrompt,
    rejectPrompt,
    enablePrompt,
    disablePrompt,
    addCustomSkill,
    updateCustomSkill,
    removeCustomSkill,
    submitCustomSkillForReview,
    approveCustomSkill,
    rejectCustomSkill,
    enableCustomSkill,
    disableCustomSkill,
    addMCPServer,
    updateMCPServer,
    removeMCPServer,
    submitMCPServerForReview,
    approveMCPServer,
    rejectMCPServer,
    enableMCPServer,
    disableMCPServer,
    updateExternalSkill,
    removeExternalSkill,
    submitExternalSkillForReview,
    approveExternalSkill,
    rejectExternalSkill,
    enableExternalSkill,
    disableExternalSkill,
    addToolboxTool,
    updateToolboxTool,
    removeToolboxTool,
    submitToolboxToolForReview,
    approveToolboxTool,
    rejectToolboxTool,
    enableToolboxTool,
    disableToolboxTool,
  } = useExtensions();

  const items = useMemo(
    () => toSkillItems(prompts, externalSkills, customSkills, mcpServers, toolbox),
    [prompts, externalSkills, customSkills, mcpServers, toolbox]
  );

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return items.filter((item) => {
      const matchKeyword = !keyword
        || item.name.toLowerCase().includes(keyword)
        || item.description.toLowerCase().includes(keyword);
      const matchKind = kindFilter === 'ALL' || item.kind === kindFilter;
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchKeyword && matchKind && matchStatus;
    });
  }, [items, kindFilter, searchText, statusFilter]);

  const counters = useMemo(() => ({
    total: items.length,
    enabled: items.filter((item) => item.status === 'ENABLED').length,
    pending: items.filter((item) => item.status === 'PENDING').length,
  }), [items]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingItem(null);
    setDrawerStep(0);
    form.resetFields();
  };

  const goNextStep = async () => {
    if (drawerStep === 0) {
      await form.validateFields(['kind', 'name', 'description']);
    }
    if (drawerStep === 1) {
      const kind = form.getFieldValue('kind') as SkillKind;
      const fields = kind === 'PROMPT'
        ? ['promptContent']
        : kind === 'MCP'
          ? ['serverType', 'command']
          : kind === 'TOOLBOX'
            ? ['toolType']
            : ['endpoint'];
      await form.validateFields(fields);
    }
    setDrawerStep((step) => Math.min(2, step + 1));
  };

  const openCreateDrawer = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      kind: 'PROMPT',
      icon: '📝',
      category: 'Prompt模版',
      method: 'POST',
      serverType: 'http',
      toolType: 'file-compare',
      parameterSchema: '{\n  "type": "object",\n  "properties": {}\n}',
    });
    setDrawerStep(0);
    setDrawerOpen(true);
  };

  const openEditDrawer = (item: SkillItem) => {
    setEditingItem(item);
    const raw = item.raw as any;
    form.setFieldsValue({
      kind: item.kind,
      name: item.name,
      description: item.description,
      icon: item.icon,
      category: item.category,
      promptContent: raw.content,
      endpoint: raw.endpoint || raw.filePath || raw.repoUrl || raw.command || '',
      method: raw.method || 'POST',
      headers: '{}',
      parameterSchema: raw.parameterSchema || '{\n  "type": "object",\n  "properties": {}\n}',
      serverType: raw.type === 'stdio' ? 'stdio' : 'http',
      command: raw.command || '',
      args: Array.isArray(raw.args) ? raw.args.join(' ') : '',
      env: raw.env ? JSON.stringify(raw.env, null, 2) : '{}',
      toolType: raw.toolType || 'file-compare',
      redirectUrl: raw.redirectUrl || '',
    });
    setDrawerStep(0);
    setDrawerOpen(true);
  };

  const saveSkill = async (submitAfterSave: boolean) => {
    const values = form.getFieldsValue(true);
    const kind = values.kind as SkillKind;

    if (!values.name || !values.name.trim()) {
      message.error('请输入技能名称');
      return;
    }

    if (submitAfterSave) {
      try {
        await form.validateFields();
      } catch {
        return;
      }
    }

    const nextStatus = submitAfterSave
      ? 'PENDING' as const
      : (editingItem?.status || 'DRAFT' as const);

    if (kind === 'PROMPT') {
      const payload = {
        name: values.name,
        description: values.description,
        icon: values.icon || '📝',
        category: values.category || 'Prompt模版',
        type: 'rag' as const,
        content: values.promptContent || '',
        enabled: editingItem ? editingItem.status === 'ENABLED' : false,
        status: nextStatus,
      };
      const saved = editingItem?.source === 'prompt'
        ? (updatePrompt(editingItem.id, payload), { id: editingItem.id })
        : addPrompt(payload);
      if (submitAfterSave && editingItem?.source === 'prompt') submitPromptForReview(editingItem.id);
      message.success(submitAfterSave ? '技能已提交审核' : '草稿已保存');
      closeDrawer();
      return saved;
    }

    if (kind === 'MCP') {
      const payload = {
        name: values.name,
        type: (values.serverType || 'http') as 'stdio' | 'http',
        command: values.command || values.endpoint || '',
        args: values.args ? String(values.args).split(/\s+/).filter(Boolean) : [],
        env: parseJsonObject(values.env),
        enabled: editingItem ? editingItem.status === 'ENABLED' : false,
        status: nextStatus,
      };
      if (editingItem?.source === 'mcp') {
        updateMCPServer(editingItem.id, payload);
        if (submitAfterSave) submitMCPServerForReview(editingItem.id);
      } else {
        addMCPServer(payload);
      }
      message.success(submitAfterSave ? 'MCP 技能已提交审核' : 'MCP 草稿已保存');
      closeDrawer();
      return;
    }

    if (kind === 'TOOLBOX') {
      const payload = {
        name: values.name,
        description: values.description,
        icon: values.icon || '🧰',
        category: values.category || '工具箱',
        toolType: (values.toolType || 'other') as ToolboxTool['toolType'],
        endpoint: values.endpoint || '',
        command: values.command || '',
        redirectUrl: values.redirectUrl || '',
        enabled: editingItem ? editingItem.status === 'ENABLED' : false,
        status: nextStatus,
      };
      if (editingItem?.source === 'toolbox') {
        updateToolboxTool(editingItem.id, payload);
        if (submitAfterSave) submitToolboxToolForReview(editingItem.id);
      } else {
        addToolboxTool(payload);
      }
      message.success(submitAfterSave ? '工具箱工具已提交审核' : '工具箱草稿已保存');
      closeDrawer();
      return;
    }

    const payload = {
      name: values.name,
      description: values.description,
      type: 'http' as const,
      filePath: values.endpoint || '',
      parameters: [],
      enabled: editingItem ? editingItem.status === 'ENABLED' : false,
      status: nextStatus,
    };
    if (editingItem?.source === 'custom') {
      updateCustomSkill(editingItem.id, payload);
      if (submitAfterSave) submitCustomSkillForReview(editingItem.id);
    } else {
      addCustomSkill(payload);
    }
    message.success(submitAfterSave ? '技能已提交审核' : '技能草稿已保存');
    closeDrawer();
  };

  const parseJsonObject = (text?: string): Record<string, string> => {
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const runAction = (item: SkillItem, action: 'submit' | 'approve' | 'reject' | 'enable' | 'disable' | 'remove') => {
    const bySource = {
      prompt: {
        submit: submitPromptForReview,
        approve: approvePrompt,
        reject: rejectPrompt,
        enable: enablePrompt,
        disable: disablePrompt,
        remove: removePrompt,
      },
      external: {
        submit: submitExternalSkillForReview,
        approve: approveExternalSkill,
        reject: rejectExternalSkill,
        enable: enableExternalSkill,
        disable: disableExternalSkill,
        remove: removeExternalSkill,
      },
      custom: {
        submit: submitCustomSkillForReview,
        approve: approveCustomSkill,
        reject: rejectCustomSkill,
        enable: enableCustomSkill,
        disable: disableCustomSkill,
        remove: removeCustomSkill,
      },
      mcp: {
        submit: submitMCPServerForReview,
        approve: approveMCPServer,
        reject: rejectMCPServer,
        enable: enableMCPServer,
        disable: disableMCPServer,
        remove: removeMCPServer,
      },
      toolbox: {
        submit: submitToolboxToolForReview,
        approve: approveToolboxTool,
        reject: rejectToolboxTool,
        enable: enableToolboxTool,
        disable: disableToolboxTool,
        remove: removeToolboxTool,
      },
    }[item.source];

    if (action === 'reject') {
      Modal.confirm({
        title: '驳回原因',
        content: (
          <Input.TextArea
            id="skill-reject-reason"
            rows={3}
            placeholder="请输入驳回原因"
            style={{ marginTop: 12 }}
          />
        ),
        okText: '驳回',
        cancelText: '取消',
        onOk: () => {
          const value = (document.getElementById('skill-reject-reason') as HTMLTextAreaElement | null)?.value;
          bySource.reject(item.id, value || '未填写驳回原因');
          message.success('已驳回，状态回到草稿');
        },
      });
      return;
    }

    bySource[action](item.id);
    const text = {
      submit: '已提交审核',
      approve: '审核已通过',
      enable: '技能已启用',
      disable: '技能已关闭',
      remove: '技能已删除',
    }[action];
    message.success(text);
    if (selectedItem?.id === item.id) setSelectedItem(null);
  };

  const renderActions = (item: SkillItem) => {
    if (item.status === 'DRAFT') {
      return (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEditDrawer(item); }}>编辑</Button>
          <Button size="small" type="primary" icon={<SendOutlined />} onClick={(e) => { e.stopPropagation(); runAction(item, 'submit'); }}>提交审核</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); runAction(item, 'remove'); }}>删除</Button>
        </>
      );
    }
    if (item.status === 'PENDING') {
      return (
        <>
          <Button size="small" icon={<CheckCircleOutlined />} onClick={(e) => { e.stopPropagation(); runAction(item, 'approve'); }}>审核通过</Button>
          <Button size="small" danger icon={<CloseCircleOutlined />} onClick={(e) => { e.stopPropagation(); runAction(item, 'reject'); }}>驳回</Button>
        </>
      );
    }
    if (item.status === 'ENABLED') {
      return (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEditDrawer(item); }}>编辑</Button>
          <Button size="small" onClick={(e) => { e.stopPropagation(); runAction(item, 'disable'); }}>关闭</Button>
        </>
      );
    }
    return (
      <>
        <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEditDrawer(item); }}>编辑</Button>
        <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); runAction(item, 'enable'); }}>开启</Button>
      </>
    );
  };

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>技能广场</Title>
          <Text type="secondary">管理提示词、技能、MCP 和工具箱能力，启用后可在对话中使用。</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>创建技能</Button>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Space wrap size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size={12}>
            <Input
              placeholder="搜索技能..."
              prefix={<SearchOutlined />}
              allowClear
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 260 }}
            />
            <Select options={KIND_OPTIONS} value={kindFilter} onChange={setKindFilter} style={{ width: 140 }} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} style={{ width: 140 }} />
          </Space>
          <Space size={8}>
            <Tag color="default">全部 {counters.total}</Tag>
            <Tag color="green">已启用 {counters.enabled}</Tag>
            <Tag color="orange">待审核 {counters.pending}</Tag>
          </Space>
        </Space>
      </Card>

      <Space wrap style={{ marginBottom: 16 }}>
        {KIND_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type={kindFilter === option.value ? 'primary' : 'default'}
            onClick={() => setKindFilter(option.value as 'ALL' | SkillKind)}
          >
            {option.label}
          </Button>
        ))}
      </Space>

      {filteredItems.length === 0 ? (
        <Empty description="暂无匹配技能" style={{ marginTop: 80 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredItems.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <Card
                key={`${item.source}-${item.id}`}
                hoverable
                onClick={() => {
                  const raw = item.raw as ToolboxTool;
                  if (item.kind === 'TOOLBOX' && raw.toolType === 'dify-agent' && raw.redirectUrl) {
                    window.open(raw.redirectUrl, '_blank');
                  } else if (item.kind === 'TOOLBOX' && TOOL_PAGE_TYPES.includes(raw.toolType)) {
                    router.push(`/tools/${raw.toolType}`);
                  } else {
                    setSelectedItem(item);
                  }
                }}
                styles={{ body: { padding: 18 } }}
                style={{ borderRadius: 8 }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--color-muted)', fontSize: 24, flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <Text strong ellipsis style={{ maxWidth: 180 }}>{item.name}</Text>
                      <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>
                    </div>
                    <Space size={4} wrap style={{ marginTop: 6 }}>
                      <Tag>{item.kind === 'PROMPT' ? 'Prompt模版' : item.kind === 'SKILL' ? 'Skills' : item.kind === 'MCP' ? 'MCP Server' : '工具箱'}</Tag>
                      <Tag color="blue">{item.category}</Tag>
                    </Space>
                    <Paragraph ellipsis={{ rows: 2 }} style={{ margin: '10px 0 14px', color: 'var(--color-secondary)' }}>
                      {item.description}
                    </Paragraph>
                    {item.rejectReason && (
                      <Text type="danger" style={{ fontSize: 12 }}>驳回：{item.rejectReason}</Text>
                    )}
                    <Space wrap size={8} style={{ marginTop: item.rejectReason ? 10 : 0 }}>
                      {renderActions(item)}
                      <Button size="small" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}>详情</Button>
                    </Space>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Drawer
        title={editingItem ? '编辑技能' : '创建技能'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={680}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <Button disabled={drawerStep === 0} onClick={() => setDrawerStep((step) => Math.max(0, step - 1))}>上一步</Button>
              <Button disabled={drawerStep === 2} onClick={goNextStep}>下一步</Button>
            </Space>
            <Space>
              <Button onClick={() => saveSkill(false)}>保存草稿</Button>
              <Button type="primary" onClick={() => saveSkill(true)}>提交审核</Button>
            </Space>
          </div>
        }
      >
        <Steps
          size="small"
          current={drawerStep}
          style={{ marginBottom: 24 }}
          items={[
            { title: '基本信息' },
            { title: '技能配置' },
            { title: '预览' },
          ]}
        />
        <Form form={form} layout="vertical">
          <div style={{ display: drawerStep === 0 ? 'block' : 'none' }}>
            <Form.Item name="kind" label="分类" rules={[{ required: true, message: '请选择技能分类' }]}>
              <Select
                options={[
                  { label: 'Prompt模版', value: 'PROMPT' },
                  { label: 'Skills', value: 'SKILL' },
                  { label: 'MCP Server', value: 'MCP' },
                  { label: '工具箱', value: 'TOOLBOX' },
                ]}
              />
            </Form.Item>
            <Form.Item name="name" label="技能名称" rules={[{ required: true, message: '请输入技能名称' }]}>
              <Input placeholder="如：审计报告生成" />
            </Form.Item>
            <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入技能描述' }]}>
              <Input.TextArea rows={3} placeholder="说明技能的用途和适用场景" />
            </Form.Item>
            <Form.Item name="icon" label="图标">
              <Input placeholder="如：📋" />
            </Form.Item>
            <Form.Item name="category" label="业务分类">
              <Input placeholder="如：审计报告类、法规查询类" />
            </Form.Item>
          </div>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.kind !== curr.kind}>
            {({ getFieldValue }) => {
              const kind = getFieldValue('kind') as SkillKind;
              return (
                <div style={{ display: drawerStep === 1 ? 'block' : 'none' }}>
                  {kind === 'PROMPT' && (
                    <Form.Item name="promptContent" label="提示词内容" rules={[{ required: true, message: '请输入提示词内容' }]}>
                      <Input.TextArea rows={12} placeholder="支持 {变量名} 语法" />
                    </Form.Item>
                  )}
                  {kind === 'SKILL' && (
                    <>
                      <Form.Item name="endpoint" label="Skill 端点 / 命令" rules={[{ required: true, message: '请输入 Skill 端点或命令' }]}>
                        <Input placeholder="https://api.example.com/skill 或 npx skill-name" />
                      </Form.Item>
                      <Form.Item name="method" label="请求方法">
                        <Select options={['GET', 'POST', 'PUT', 'DELETE'].map((value) => ({ label: value, value }))} />
                      </Form.Item>
                      <Form.Item name="headers" label="Headers">
                        <Input.TextArea rows={4} placeholder='{"Authorization":"Bearer ..."}' />
                      </Form.Item>
                      <Form.Item name="parameterSchema" label="参数 Schema">
                        <Input.TextArea rows={8} />
                      </Form.Item>
                    </>
                  )}
                  {kind === 'TOOLBOX' && (
                    <>
                      <Form.Item name="toolType" label="工具类型" rules={[{ required: true, message: '请选择工具类型' }]}>
                        <Select
                          options={[
                            { label: '文件对比', value: 'file-compare' },
                            { label: '文本差异', value: 'text-diff' },
                            { label: 'JSON 格式化', value: 'json-formatter' },
                            { label: '代码格式化', value: 'code-formatter' },
                            { label: '正则测试', value: 'regex-tester' },
                            { label: 'Dify 智能体', value: 'dify-agent' },
                            { label: '其他', value: 'other' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.toolType !== curr.toolType}>
                        {({ getFieldValue }) => {
                          const toolType = getFieldValue('toolType');
                          if (toolType === 'dify-agent') {
                            return (
                              <Form.Item name="redirectUrl" label="Dify 智能体地址" rules={[{ required: true, message: '请输入 Dify 智能体链接' }]}>
                                <Input placeholder="http://193.134.211.121/chat/ZZnSGKRHPIUXBHtk" />
                              </Form.Item>
                            );
                          }
                          return (
                            <>
                              <Form.Item name="endpoint" label="工具端点 (可选)">
                                <Input placeholder="https://api.example.com/tool" />
                              </Form.Item>
                              <Form.Item name="command" label="命令 (可选)">
                                <Input placeholder="diff file1 file2" />
                              </Form.Item>
                            </>
                          );
                        }}
                      </Form.Item>
                    </>
                  )}
                  {kind === 'MCP' && (
                    <>
                      <Form.Item name="serverType" label="服务器类型">
                        <Select options={[{ label: 'STDIO', value: 'stdio' }, { label: 'HTTP', value: 'http' }]} />
                      </Form.Item>
                      <Form.Item name="command" label="命令/端点" rules={[{ required: true, message: '请输入命令或端点' }]}>
                        <Input placeholder="node server.js 或 https://mcp.example.com" />
                      </Form.Item>
                      <Form.Item name="args" label="参数">
                        <Input placeholder="--stdio --config config.json" />
                      </Form.Item>
                      <Form.Item name="env" label="环境变量">
                        <Input.TextArea rows={5} placeholder='{"API_KEY":"..."}' />
                      </Form.Item>
                    </>
                  )}
                </div>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldsValue }) => {
              const values = getFieldsValue();
              return (
                <div style={{ display: drawerStep === 2 ? 'block' : 'none' }}>
                  <Card>
                    <Space align="start" size={12}>
                      <div style={{ fontSize: 28 }}>{values.icon || '📝'}</div>
                      <div>
                        <Title level={5} style={{ margin: 0 }}>{values.name || '未命名技能'}</Title>
                        <Text type="secondary">{values.description || '暂无描述'}</Text>
                        <div style={{ marginTop: 10 }}>
                          <Tag>{values.kind === 'PROMPT' ? 'Prompt模版' : values.kind === 'SKILL' ? 'Skills' : values.kind === 'MCP' ? 'MCP Server' : '工具箱'}</Tag>
                          {values.category && <Tag color="blue">{values.category}</Tag>}
                        </div>
                      </div>
                    </Space>
                    {values.kind === 'PROMPT' && values.promptContent && (
                      <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', background: 'var(--color-muted)', padding: 12, borderRadius: 8 }}>
                        {values.promptContent}
                      </pre>
                    )}
                  </Card>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="技能详情"
        open={!!selectedItem}
        onCancel={() => setSelectedItem(null)}
        footer={selectedItem ? <Space>{renderActions(selectedItem)}</Space> : null}
        width={680}
      >
        {selectedItem && (
          <div>
            <Space align="start" size={14} style={{ marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--color-muted)', fontSize: 28 }}>
                {selectedItem.icon}
              </div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{selectedItem.name}</Title>
                <Paragraph style={{ margin: '6px 0 0' }}>{selectedItem.description}</Paragraph>
                <Space wrap style={{ marginTop: 8 }}>
                  <Tag color={STATUS_META[selectedItem.status].color}>{STATUS_META[selectedItem.status].label}</Tag>
                  <Tag>{selectedItem.kind === 'PROMPT' ? 'Prompt模版' : selectedItem.kind === 'SKILL' ? 'Skills' : selectedItem.kind === 'MCP' ? 'MCP Server' : '工具箱'}</Tag>
                  <Tag color="blue">{selectedItem.category}</Tag>
                </Space>
              </div>
            </Space>
            {selectedItem.rejectReason && <Tag color="red">驳回原因：{selectedItem.rejectReason}</Tag>}
            <Descriptions column={1} size="small" bordered style={{ marginTop: 16 }}>
              <Descriptions.Item label="来源">{selectedItem.source}</Descriptions.Item>
              <Descriptions.Item label="状态">{STATUS_META[selectedItem.status].label}</Descriptions.Item>
              {'content' in selectedItem.raw && selectedItem.raw.content && (
                <Descriptions.Item label="提示词">
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{selectedItem.raw.content}</pre>
                </Descriptions.Item>
              )}
              {'installCommand' in selectedItem.raw && selectedItem.raw.installCommand && (
                <Descriptions.Item label="安装命令">
                  <Text code copyable>{selectedItem.raw.installCommand}</Text>
                </Descriptions.Item>
              )}
              {'command' in selectedItem.raw && selectedItem.raw.command && (
                <Descriptions.Item label="命令/端点">
                  <Text code copyable>{selectedItem.raw.command}</Text>
                </Descriptions.Item>
              )}
              {'redirectUrl' in selectedItem.raw && selectedItem.raw.redirectUrl && (
                <Descriptions.Item label="Dify 智能体地址">
                  <a href={selectedItem.raw.redirectUrl} target="_blank" rel="noopener noreferrer">
                    {selectedItem.raw.redirectUrl}
                  </a>
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
