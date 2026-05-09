'use client';

import React, { useState, useMemo } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  Popconfirm,
  message as antdMessage,
  Alert,
  App as AntApp,
  Empty,
  Tooltip,
  Badge,
  Descriptions,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  FileTextOutlined,
  ApiOutlined,
  AppstoreOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  StopOutlined,
  SafetyOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  FormOutlined,
  LineChartOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { useExtensions, type PromptConfig, type ExternalSkill } from '@/hooks/useExtensions';

const { Title, Text, Paragraph } = Typography;

// 审计业务分类配置
const AUDIT_CATEGORIES = {
  '审计报告类': { icon: <FileTextOutlined />, color: 'blue', desc: '审计报告生成、问题定性、审计意见出具' },
  '法规查询类': { icon: <SafetyOutlined />, color: 'purple', desc: '法规检索、合规性检查、法规比对' },
  '数据分析类': { icon: <LineChartOutlined />, color: 'green', desc: '异常交易识别、指标计算、趋势分析' },
  '文档处理类': { icon: <FormOutlined />, color: 'orange', desc: '会议纪要提取、合同比对、附件解析' },
};

const PROMPT_CATEGORIES = {
  '审计报告类': { icon: <FileTextOutlined />, color: 'blue' },
  '法规查询类': { icon: <SafetyOutlined />, color: 'purple' },
  '数据分析类': { icon: <LineChartOutlined />, color: 'green' },
  '文档处理类': { icon: <FormOutlined />, color: 'orange' },
};

export default function ExtensionsPage() {
  const { message: antdMsg } = AntApp.useApp();

  const {
    prompts, addPrompt, updatePrompt, removePrompt, setDefaultPrompt, exportPrompts, importPrompts,
    externalSkills, addExternalSkill, updateExternalSkill, removeExternalSkill, exportExternalSkills, importExternalSkills,
  } = useExtensions();

  // External Skills state
  const [searchText, setSearchText] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<ExternalSkill | null>(null);
  const [skillModalVisible, setSkillModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<ExternalSkill | null>(null);
  const [skillForm] = Form.useForm();

  // Prompts state
  const [promptSearchText, setPromptSearchText] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [promptModalVisible, setPromptModalVisible] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptConfig | null>(null);
  const [promptForm] = Form.useForm();

  // External Skills handlers
  const handleToggleSkill = (skill: ExternalSkill, checked: boolean) => {
    updateExternalSkill(skill.id, { enabled: checked });
    antdMsg.success(`Skill 已${checked ? '启用' : '禁用'}`);
  };

  const openSkillModal = (skill?: ExternalSkill) => {
    setEditingSkill(skill || null);
    if (skill) {
      skillForm.setFieldsValue(skill);
    } else {
      skillForm.resetFields();
      skillForm.setFieldsValue({ enabled: true, category: '审计报告类' });
    }
    setSkillModalVisible(true);
  };

  const handleSaveSkill = async () => {
    try {
      const values = await skillForm.validateFields();
      if (editingSkill) {
        updateExternalSkill(editingSkill.id, values);
        antdMsg.success('Skill 已更新');
      } else {
        addExternalSkill(values);
        antdMsg.success('Skill 已添加');
      }
      setSkillModalVisible(false);
    } catch {}
  };

  // Prompts handlers
  const handleTogglePrompt = (prompt: PromptConfig, checked: boolean) => {
    updatePrompt(prompt.id, { enabled: checked });
    antdMsg.success(`提示词已${checked ? '启用' : '禁用'}`);
  };

  const openPromptModal = (prompt?: PromptConfig) => {
    setEditingPrompt(prompt || null);
    if (prompt) {
      promptForm.setFieldsValue(prompt);
    } else {
      promptForm.resetFields();
      promptForm.setFieldsValue({ type: 'rag', enabled: true, category: '审计报告类' });
    }
    setPromptModalVisible(true);
  };

  const handleSavePrompt = async () => {
    try {
      const values = await promptForm.validateFields();
      if (editingPrompt) {
        updatePrompt(editingPrompt.id, values);
        antdMsg.success('提示词已更新');
      } else {
        addPrompt(values);
        antdMsg.success('提示词已添加');
      }
      setPromptModalVisible(false);
    } catch {}
  };

  // Filter and group External Skills
  const groupedSkills = useMemo(() => {
    const filtered = externalSkills.filter(skill => {
      if (!searchText) return true;
      return skill.name.toLowerCase().includes(searchText.toLowerCase()) ||
             skill.description.toLowerCase().includes(searchText.toLowerCase());
    });

    const grouped: Record<string, ExternalSkill[]> = {};
    Object.keys(AUDIT_CATEGORIES).forEach(cat => {
      grouped[cat] = filtered.filter(s => s.category === cat);
    });
    return grouped;
  }, [externalSkills, searchText]);

  const enabledSkillsCount = externalSkills.filter(s => s.enabled).length;

  // Filter and group Prompts
  const groupedPrompts = useMemo(() => {
    const filtered = prompts.filter(prompt => {
      if (!promptSearchText) return true;
      return prompt.name.toLowerCase().includes(promptSearchText.toLowerCase()) ||
             prompt.description.toLowerCase().includes(promptSearchText.toLowerCase());
    });

    const grouped: Record<string, PromptConfig[]> = {};
    Object.keys(PROMPT_CATEGORIES).forEach(cat => {
      grouped[cat] = filtered.filter(p => p.category === cat);
    });
    return grouped;
  }, [prompts, promptSearchText]);

  const enabledPromptsCount = prompts.filter(p => p.enabled).length;

  const renderSkillCard = (skill: ExternalSkill) => (
    <Card
      key={skill.id}
      hoverable
      onClick={() => setSelectedSkill(skill)}
      style={{ borderRadius: 12, transition: 'all 0.3s ease' }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: skill.enabled
            ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
            : 'var(--color-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
          opacity: skill.enabled ? 1 : 0.5,
        }}>
          {skill.icon || '📦'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text strong style={{ fontSize: 14, color: skill.enabled ? 'var(--color-foreground)' : 'var(--color-secondary)' }}>
              {skill.name}
            </Text>
            <Switch
              size="small"
              checked={skill.enabled}
              onChange={(checked) => handleToggleSkill(skill, checked)}
            />
          </div>
          <Paragraph
            ellipsis={{ rows: 2, expandable: false }}
            style={{ margin: 0, fontSize: 12, color: 'var(--color-secondary)' }}
          >
            {skill.description}
          </Paragraph>
        </div>
      </div>
    </Card>
  );

  const renderPromptCard = (prompt: PromptConfig) => (
    <Card
      key={prompt.id}
      hoverable
      onClick={() => setSelectedPrompt(prompt)}
      style={{ borderRadius: 12, transition: 'all 0.3s ease' }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: prompt.enabled
            ? 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)'
            : 'var(--color-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
          opacity: prompt.enabled ? 1 : 0.5,
        }}>
          {prompt.icon || '💬'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text strong style={{ fontSize: 14, color: prompt.enabled ? 'var(--color-foreground)' : 'var(--color-secondary)' }}>
              {prompt.name}
            </Text>
            <Switch
              size="small"
              checked={prompt.enabled}
              onChange={(checked) => handleTogglePrompt(prompt, checked)}
            />
          </div>
          <Paragraph
            ellipsis={{ rows: 2, expandable: false }}
            style={{ margin: 0, fontSize: 12, color: 'var(--color-secondary)' }}
          >
            {prompt.description}
          </Paragraph>
        </div>
      </div>
    </Card>
  );

  const renderExternalSkillsTab = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Input
              placeholder="搜索 Skills..."
              prefix={<SearchOutlined style={{ color: 'var(--color-secondary)' }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 260, borderRadius: 8 }}
              allowClear
            />
            <Tag color="blue">
              <CheckCircleOutlined /> 已启用 {enabledSkillsCount}/{externalSkills.length}
            </Tag>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openSkillModal()}>
            添加 Skill
          </Button>
        </div>
      </div>

      {Object.entries(groupedSkills).map(([category, skills]) => {
        if (skills.length === 0) return null;
        const catConfig = AUDIT_CATEGORIES[category as keyof typeof AUDIT_CATEGORIES];
        return (
          <div key={category} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16, color: 'var(--color-primary)' }}>{catConfig.icon}</span>
              <Text strong style={{ fontSize: 15 }}>{category}</Text>
              <Tag color={catConfig.color} style={{ marginLeft: 8 }}>{skills.length} 个</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>— {catConfig.desc}</Text>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}>
              {skills.map(renderSkillCard)}
            </div>
          </div>
        );
      })}

      {externalSkills.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无审计相关 Skills"
          style={{ marginTop: 60 }}
        />
      )}

      <Alert
        message="使用说明"
        description="启用后的 Skills 可在知识问答页面直接使用。点击卡片可查看详情或编辑配置。"
        type="info"
        showIcon
        style={{ marginTop: 24 }}
      />
    </div>
  );

  const renderPromptsTab = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Input
              placeholder="搜索提示词..."
              prefix={<SearchOutlined style={{ color: 'var(--color-secondary)' }} />}
              value={promptSearchText}
              onChange={e => setPromptSearchText(e.target.value)}
              style={{ width: 260, borderRadius: 8 }}
              allowClear
            />
            <Tag color="purple">
              <CheckCircleOutlined /> 已启用 {enabledPromptsCount}/{prompts.length}
            </Tag>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPromptModal()}>
            添加提示词
          </Button>
        </div>
      </div>

      {Object.entries(groupedPrompts).map(([category, categoryPrompts]) => {
        if (categoryPrompts.length === 0) return null;
        const catConfig = PROMPT_CATEGORIES[category as keyof typeof PROMPT_CATEGORIES];
        return (
          <div key={category} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16, color: '#722ed1' }}>{catConfig.icon}</span>
              <Text strong style={{ fontSize: 15 }}>{category}</Text>
              <Tag color={catConfig.color} style={{ marginLeft: 8 }}>{categoryPrompts.length} 个</Tag>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}>
              {categoryPrompts.map(renderPromptCard)}
            </div>
          </div>
        );
      })}

      {prompts.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无审计相关提示词"
          style={{ marginTop: 60 }}
        />
      )}

      <Alert
        message="使用说明"
        description="启用后的提示词可作为知识问答的系统提示词使用。点击卡片可查看详情或编辑配置。"
        type="info"
        showIcon
        style={{ marginTop: 24 }}
      />
    </div>
  );

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <SettingOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>扩展管理</Title>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'external-skills',
            label: <span><ApiOutlined /> 审计 Skills <Badge count={enabledSkillsCount} style={{ marginLeft: 8 }} /></span>,
            children: renderExternalSkillsTab(),
          },
          {
            key: 'prompts',
            label: <span><FileTextOutlined /> 审计提示词 <Badge count={enabledPromptsCount} style={{ marginLeft: 8 }} /></span>,
            children: renderPromptsTab(),
          },
        ]}
      />

      {/* Skill Detail Modal */}
      <Modal
        title={null}
        open={!!selectedSkill}
        onCancel={() => setSelectedSkill(null)}
        footer={null}
        width={600}
      >
        {selectedSkill && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: selectedSkill.enabled
                  ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
                  : 'var(--color-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
              }}>
                {selectedSkill.icon || '📦'}
              </div>
              <div style={{ flex: 1 }}>
                <Title level={5} style={{ margin: 0 }}>{selectedSkill.name}</Title>
                <Space style={{ marginTop: 8 }}>
                  {selectedSkill.category && <Tag color="blue">{selectedSkill.category}</Tag>}
                  {selectedSkill.enabled
                    ? <Tag color="success"><CheckCircleOutlined /> 已启用</Tag>
                    : <Tag color="default"><StopOutlined /> 已禁用</Tag>
                  }
                </Space>
              </div>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setSelectedSkill(null);
                  openSkillModal(selectedSkill);
                }}
              >
                编辑
              </Button>
            </div>

            <Card style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>描述</Text>
              <Paragraph style={{ margin: 0 }}>{selectedSkill.description}</Paragraph>
            </Card>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="GitHub 仓库">
                <a href={selectedSkill.repoUrl} target="_blank" rel="noopener noreferrer">
                  <Text code>{selectedSkill.repoUrl}</Text>
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="安装命令">
                <Text code copyable>{selectedSkill.installCommand}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="作者">{selectedSkill.author || '未知'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <Text type="secondary" style={{ fontSize: 12 }}>
              提示：启用后此 Skill 可在知识问答页面直接使用。禁用则不在问答界面显示。
            </Text>
          </div>
        )}
      </Modal>

      {/* Prompt Detail Modal */}
      <Modal
        title={null}
        open={!!selectedPrompt}
        onCancel={() => setSelectedPrompt(null)}
        footer={null}
        width={700}
      >
        {selectedPrompt && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: selectedPrompt.enabled
                  ? 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)'
                  : 'var(--color-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
              }}>
                {selectedPrompt.icon || '💬'}
              </div>
              <div style={{ flex: 1 }}>
                <Title level={5} style={{ margin: 0 }}>{selectedPrompt.name}</Title>
                <Space style={{ marginTop: 8 }}>
                  {selectedPrompt.category && <Tag color="purple">{selectedPrompt.category}</Tag>}
                  {selectedPrompt.enabled
                    ? <Tag color="success"><CheckCircleOutlined /> 已启用</Tag>
                    : <Tag color="default"><StopOutlined /> 已禁用</Tag>
                  }
                </Space>
              </div>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setSelectedPrompt(null);
                  openPromptModal(selectedPrompt);
                }}
              >
                编辑
              </Button>
            </div>

            <Card style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>描述</Text>
              <Paragraph style={{ margin: 0 }}>{selectedPrompt.description}</Paragraph>
            </Card>

            {selectedPrompt.content && (
              <Card style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>提示词内容</Text>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  maxHeight: 300,
                  overflow: 'auto',
                }}>
                  {selectedPrompt.content}
                </pre>
              </Card>
            )}

            {selectedPrompt.tags && selectedPrompt.tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>标签</Text>
                <Space wrap>
                  {selectedPrompt.tags.map(tag => (
                    <Tag key={tag} color="purple">{tag}</Tag>
                  ))}
                </Space>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add/Edit Skill Modal */}
      <Modal
        title={editingSkill ? '编辑 Skill' : '添加 Skill'}
        open={skillModalVisible}
        onOk={handleSaveSkill}
        onCancel={() => setSkillModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={skillForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入 Skill 名称' }]}>
            <Input placeholder="如：审计报告生成" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="简要描述 Skill 的功能和用途" rows={2} />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Space wrap>
              {Object.entries(AUDIT_CATEGORIES).map(([cat, config]) => (
                <Tag key={cat} color={config.color} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                  {config.icon} {cat}
                </Tag>
              ))}
            </Space>
          </Form.Item>
          <Form.Item name="icon" label="图标 (emoji)">
            <Input placeholder="如：📋" />
          </Form.Item>
          <Form.Item name="author" label="作者">
            <Input placeholder="如：AuditTools" />
          </Form.Item>
          <Form.Item name="repoUrl" label="GitHub 仓库" rules={[{ required: true, message: '请输入仓库地址' }]}>
            <Input placeholder="https://github.com/xxx/xxx-skills" />
          </Form.Item>
          <Form.Item name="installCommand" label="安装命令" rules={[{ required: true, message: '请输入安装命令' }]}>
            <Input placeholder="npx skills add xxx/xxx" />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add/Edit Prompt Modal */}
      <Modal
        title={editingPrompt ? '编辑提示词' : '添加提示词'}
        open={promptModalVisible}
        onOk={handleSavePrompt}
        onCancel={() => setPromptModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={promptForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入提示词名称' }]}>
            <Input placeholder="如：审计发现撰写" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="简要描述提示词的用途" rows={2} />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Space wrap>
              {Object.entries(PROMPT_CATEGORIES).map(([cat, config]) => (
                <Tag key={cat} color={config.color} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                  {config.icon} {cat}
                </Tag>
              ))}
            </Space>
          </Form.Item>
          <Form.Item name="icon" label="图标 (emoji)">
            <Input placeholder="如：📝" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="用逗号分隔，如：审计报告,问题描述,撰写" />
          </Form.Item>
          <Form.Item name="content" label="提示词内容">
            <Input.TextArea placeholder="完整的提示词模板内容" rows={10} />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
}