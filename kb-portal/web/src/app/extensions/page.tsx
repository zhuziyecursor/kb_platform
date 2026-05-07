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
  Select,
  Switch,
  Popconfirm,
  Upload,
  message as antdMessage,
  Alert,
  App as AntApp,
  InputRef,
  Empty,
  Tooltip,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
  BookOutlined,
  ApiOutlined,
  AppstoreOutlined,
  SettingOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  GithubOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { useExtensions, type PromptConfig, type ExternalSkill, type CustomSkill, type MCPServer } from '@/hooks/useExtensions';

const { Title, Text, Paragraph } = Typography;

export default function ExtensionsPage() {
  const { message: antdMsg } = AntApp.useApp();

  const {
    prompts, addPrompt, updatePrompt, removePrompt, setDefaultPrompt, exportPrompts, importPrompts,
    externalSkills, addExternalSkill, updateExternalSkill, removeExternalSkill, exportExternalSkills, importExternalSkills,
    customSkills, addCustomSkill, updateCustomSkill, removeCustomSkill, exportCustomSkills, importCustomSkills,
    mcpServers, addMCPServer, updateMCPServer, removeMCPServer, testMCPServer, exportMCPServers, importMCPServers,
  } = useExtensions();

  const isAdmin = true;

  // External Skills state
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [selectedSkill, setSelectedSkill] = useState<ExternalSkill | null>(null);

  // Prompts state
  const [promptSearchText, setPromptSearchText] = useState('');
  const [promptActiveCategory, setPromptActiveCategory] = useState('全部');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [promptModalVisible, setPromptModalVisible] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptConfig | null>(null);
  const [promptForm] = Form.useForm();

  // Modals
  const [externalSkillModalVisible, setExternalSkillModalVisible] = useState(false);
  const [editingExternalSkill, setEditingExternalSkill] = useState<ExternalSkill | null>(null);
  const [externalSkillForm] = Form.useForm();

  const [customSkillModalVisible, setCustomSkillModalVisible] = useState(false);
  const [editingCustomSkill, setEditingCustomSkill] = useState<CustomSkill | null>(null);
  const [customSkillForm] = Form.useForm();

  const [mcpServerModalVisible, setMCPServerModalVisible] = useState(false);
  const [editingMCPServer, setEditingMCPServer] = useState<MCPServer | null>(null);
  const [mcpServerForm] = Form.useForm();

  // External Skills derived data
  const categories = useMemo(() => {
    const cats = ['全部', ...new Set(externalSkills.map(s => s.category || '未分类'))];
    return cats;
  }, [externalSkills]);

  const filteredSkills = useMemo(() => {
    return externalSkills.filter(skill => {
      const matchSearch = !searchText ||
        skill.name.toLowerCase().includes(searchText.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchText.toLowerCase()) ||
        skill.author?.toLowerCase().includes(searchText.toLowerCase());
      const matchCategory = activeCategory === '全部' || skill.category === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [externalSkills, searchText, activeCategory]);

  // Prompts derived data
  const promptCategories = useMemo(() => {
    const cats = ['全部', ...new Set(prompts.map(p => p.category || '未分类'))];
    return cats;
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter(prompt => {
      const matchSearch = !promptSearchText ||
        prompt.name.toLowerCase().includes(promptSearchText.toLowerCase()) ||
        prompt.description.toLowerCase().includes(promptSearchText.toLowerCase()) ||
        prompt.author?.toLowerCase().includes(promptSearchText.toLowerCase());
      const matchCategory = promptActiveCategory === '全部' || prompt.category === promptActiveCategory;
      return matchSearch && matchCategory;
    });
  }, [prompts, promptSearchText, promptActiveCategory]);

  const copyInstallCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    antdMsg.success('安装命令已复制到剪贴板');
  };

  // External Skills handlers
  const openExternalSkillModal = (skill?: ExternalSkill) => {
    setEditingExternalSkill(skill || null);
    if (skill) {
      externalSkillForm.setFieldsValue(skill);
    } else {
      externalSkillForm.resetFields();
    }
    setExternalSkillModalVisible(true);
  };

  const handleSaveExternalSkill = async () => {
    try {
      const values = await externalSkillForm.validateFields();
      if (editingExternalSkill) {
        updateExternalSkill(editingExternalSkill.id, values);
        antdMsg.success('Skill 已更新');
      } else {
        addExternalSkill(values);
        antdMsg.success('Skill 已添加');
      }
      setExternalSkillModalVisible(false);
    } catch {}
  };

  const handleImportExternalSkills: UploadProps['beforeUpload'] = (file) => {
    importExternalSkills(file).then(success => {
      if (success) antdMsg.success('导入成功');
      else antdMsg.error('导入失败，请检查文件格式');
    });
    return false;
  };

  // Prompts handlers
  const openPromptModal = (prompt?: PromptConfig) => {
    setEditingPrompt(prompt || null);
    if (prompt) {
      promptForm.setFieldsValue(prompt);
    } else {
      promptForm.resetFields();
      promptForm.setFieldsValue({ type: 'general' });
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

  // Custom Skills handlers
  const openCustomSkillModal = (skill?: CustomSkill) => {
    setEditingCustomSkill(skill || null);
    if (skill) {
      customSkillForm.setFieldsValue(skill);
    } else {
      customSkillForm.resetFields();
      customSkillForm.setFieldsValue({ type: 'script', enabled: true, parameters: [] });
    }
    setCustomSkillModalVisible(true);
  };

  const handleSaveCustomSkill = async () => {
    try {
      const values = await customSkillForm.validateFields();
      if (editingCustomSkill) {
        updateCustomSkill(editingCustomSkill.id, values);
        antdMsg.success('自定义 Skill 已更新');
      } else {
        addCustomSkill(values);
        antdMsg.success('自定义 Skill 已添加');
      }
      setCustomSkillModalVisible(false);
    } catch {}
  };

  // MCP Servers handlers
  const openMCPServerModal = (server?: MCPServer) => {
    setEditingMCPServer(server || null);
    if (server) {
      mcpServerForm.setFieldsValue(server);
    } else {
      mcpServerForm.resetFields();
      mcpServerForm.setFieldsValue({ type: 'stdio', enabled: true, args: [], env: {} });
    }
    setMCPServerModalVisible(true);
  };

  const handleSaveMCPServer = async () => {
    try {
      const values = await mcpServerForm.validateFields();
      if (editingMCPServer) {
        updateMCPServer(editingMCPServer.id, values);
        antdMsg.success('MCP Server 已更新');
      } else {
        addMCPServer(values);
        antdMsg.success('MCP Server 已添加');
      }
      setMCPServerModalVisible(false);
    } catch {}
  };

  const handleImportMCPServers: UploadProps['beforeUpload'] = (file) => {
    importMCPServers(file).then(success => {
      if (success) antdMsg.success('导入成功');
      else antdMsg.error('导入失败，请检查文件格式');
    });
    return false;
  };

  // Render functions
  const renderPromptCard = (prompt: PromptConfig) => (
    <Card
      key={prompt.id}
      hoverable
      onClick={() => setSelectedPrompt(prompt)}
      style={{
        borderRadius: 12,
        transition: 'all 0.3s ease',
        height: '100%',
      }}
      styles={{ body: { padding: 20 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          flexShrink: 0,
        }}>
          {prompt.icon || '💬'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text strong style={{ fontSize: 16, color: 'var(--color-foreground)' }}>
              {prompt.name}
            </Text>
          </div>
          {prompt.category && (
            <Tag color="purple" style={{ marginBottom: 8 }}>{prompt.category}</Tag>
          )}
          <Paragraph
            ellipsis={{ rows: 2, expandable: false }}
            style={{ margin: 0, color: 'var(--color-secondary)', fontSize: 13 }}
          >
            {prompt.description}
          </Paragraph>
        </div>
      </div>
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <GithubOutlined style={{ marginRight: 4 }} />
            {prompt.author || 'Unknown'}
          </Text>
        </Space>
        <Space size="small">
          <Popconfirm
            title="确定要删除这个提示词吗？"
            onConfirm={() => removePrompt(prompt.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button type="link" size="small" icon={<BookOutlined />} onClick={(e) => { e.stopPropagation(); setSelectedPrompt(prompt); }}>
            查看详情
          </Button>
        </Space>
      </div>
    </Card>
  );

  const renderSkillCard = (skill: ExternalSkill) => (
    <Card
      key={skill.id}
      hoverable
      onClick={() => setSelectedSkill(skill)}
      style={{
        borderRadius: 12,
        transition: 'all 0.3s ease',
        height: '100%',
      }}
      styles={{ body: { padding: 20 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          flexShrink: 0,
        }}>
          {skill.icon || '📦'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text strong style={{ fontSize: 16, color: 'var(--color-foreground)' }}>
              {skill.name}
            </Text>
          </div>
          {skill.category && (
            <Tag color="blue" style={{ marginBottom: 8 }}>{skill.category}</Tag>
          )}
          <Paragraph
            ellipsis={{ rows: 2, expandable: false }}
            style={{ margin: 0, color: 'var(--color-secondary)', fontSize: 13 }}
          >
            {skill.description}
          </Paragraph>
        </div>
      </div>
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <GithubOutlined style={{ marginRight: 4 }} />
            {skill.author || 'Unknown'}
          </Text>
        </Space>
        <Space size="small">
          <Popconfirm
            title="确定要删除这个 Skill 吗？"
            onConfirm={() => removeExternalSkill(skill.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button type="link" size="small" icon={<BookOutlined />} onClick={(e) => { e.stopPropagation(); setSelectedSkill(skill); }}>
            查看详情
          </Button>
        </Space>
      </div>
    </Card>
  );

  const renderPromptsTab = () => (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Input
            placeholder="搜索提示词..."
            prefix={<SearchOutlined style={{ color: 'var(--color-secondary)' }} />}
            value={promptSearchText}
            onChange={e => setPromptSearchText(e.target.value)}
            style={{ width: 300, borderRadius: 8 }}
            allowClear
          />
          {isAdmin && (
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openPromptModal()}>添加提示词</Button>
            </Space>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {promptCategories.map(cat => (
            <Tag
              key={cat}
              color={promptActiveCategory === cat ? 'purple' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 16 }}
              onClick={() => setPromptActiveCategory(cat)}
            >
              {cat}
            </Tag>
          ))}
        </div>
      </div>

      {filteredPrompts.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 20,
        }}>
          {filteredPrompts.map(renderPromptCard)}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无匹配的提示词"
          style={{ marginTop: 60 }}
        />
      )}

      <Alert
        message="使用说明"
        description="点击任意提示词卡片查看详情和安装命令。提示词可帮助提升 AI 编码助手的输出质量和工作效率。"
        type="info"
        showIcon
        style={{ marginTop: 24 }}
        icon={<SwapOutlined />}
      />
    </div>
  );

  const renderExternalSkillsTab = () => (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Input
            placeholder="搜索 Skills..."
            prefix={<SearchOutlined style={{ color: 'var(--color-secondary)' }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 300, borderRadius: 8 }}
            allowClear
          />
          {isAdmin && (
            <Space>
              <Upload accept=".json" showUploadList={false} beforeUpload={handleImportExternalSkills}>
                <Button icon={<UploadOutlined />}>导入</Button>
              </Upload>
              <Button icon={<DownloadOutlined />} onClick={exportExternalSkills}>导出</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openExternalSkillModal()}>添加 Skill</Button>
            </Space>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <Tag
              key={cat}
              color={activeCategory === cat ? 'primary' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 16 }}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Tag>
          ))}
        </div>
      </div>

      {filteredSkills.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 20,
        }}>
          {filteredSkills.map(renderSkillCard)}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无匹配的 Skills"
          style={{ marginTop: 60 }}
        />
      )}

      <Alert
        message="安装说明"
        description="点击任意 Skill 卡片查看详情和安装命令，使用终端执行安装命令即可完成安装。"
        type="info"
        showIcon
        style={{ marginTop: 24 }}
        icon={<SwapOutlined />}
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
            label: <span><ApiOutlined /> 外部 Skills</span>,
            children: renderExternalSkillsTab(),
          },
          {
            key: 'prompts',
            label: <span><BookOutlined /> 提示词</span>,
            children: renderPromptsTab(),
          },
          {
            key: 'custom-skills',
            label: <span><AppstoreOutlined /> 自定义 Skills</span>,
            children: (
              <Card>
                <Text type="secondary">自定义 Skills 功能开发中...</Text>
              </Card>
            ),
          },
          {
            key: 'mcp-servers',
            label: <span><SettingOutlined /> MCP Servers</span>,
            children: (
              <Card>
                <Text type="secondary">MCP Servers 功能开发中...</Text>
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title={selectedPrompt ? selectedPrompt.name : ''}
        open={!!selectedPrompt}
        onCancel={() => setSelectedPrompt(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedPrompt(null)}>关闭</Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            onClick={() => {
              if (!selectedPrompt) return;
              navigator.clipboard.writeText(selectedPrompt.content || selectedPrompt.description);
              antdMsg.success('提示词已复制到剪贴板');
            }}
          >
            复制提示词
          </Button>,
        ]}
        width={600}
      >
        {selectedPrompt && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
              }}>
                {selectedPrompt.icon || '💬'}
              </div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{selectedPrompt.name}</Title>
                <Space style={{ marginTop: 8 }}>
                  {selectedPrompt.category && <Tag color="purple">{selectedPrompt.category}</Tag>}
                  <Text type="secondary">
                    <GithubOutlined style={{ marginRight: 4 }} />
                    {selectedPrompt.author || 'Unknown'}
                  </Text>
                </Space>
              </div>
            </div>

            <Card style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>描述</Text>
              <Paragraph style={{ margin: 0 }}>{selectedPrompt.description}</Paragraph>
            </Card>

            {selectedPrompt.content && (
              <Card style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>提示词内容</Text>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}>{selectedPrompt.content}</Paragraph>
              </Card>
            )}

            <Card style={{ background: 'linear-gradient(135deg, #722ed1 0%, #eb2f96 100%)', border: 'none' }}>
              <Text style={{ color: 'white', fontSize: 12, display: 'block', marginBottom: 8 }}>提示词内容</Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: 'white', fontFamily: 'monospace', fontSize: 13, flex: 1, maxHeight: 200, overflow: 'auto' }}>
                  {selectedPrompt.content || selectedPrompt.description}
                </Text>
                <Tooltip title="复制提示词">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    style={{ color: 'white' }}
                    onClick={() => {
                      navigator.clipboard.writeText(selectedPrompt.content || selectedPrompt.description);
                      antdMsg.success('提示词已复制到剪贴板');
                    }}
                  />
                </Tooltip>
              </div>
            </Card>
          </div>
        )}
      </Modal>

      <Modal
        title={selectedSkill ? selectedSkill.name : ''}
        open={!!selectedSkill}
        onCancel={() => setSelectedSkill(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedSkill(null)}>关闭</Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            onClick={() => selectedSkill && copyInstallCommand(selectedSkill.installCommand)}
          >
            复制安装命令
          </Button>,
        ]}
        width={600}
      >
        {selectedSkill && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
              }}>
                {selectedSkill.icon || '📦'}
              </div>
              <div>
                <Title level={5} style={{ margin: 0 }}>{selectedSkill.name}</Title>
                <Space style={{ marginTop: 8 }}>
                  {selectedSkill.category && <Tag color="blue">{selectedSkill.category}</Tag>}
                  <Text type="secondary">
                    <GithubOutlined style={{ marginRight: 4 }} />
                    {selectedSkill.author || 'Unknown'}
                  </Text>
                </Space>
              </div>
            </div>

            <Card style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>描述</Text>
              <Paragraph style={{ margin: 0 }}>{selectedSkill.description}</Paragraph>
            </Card>

            <Card style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>GitHub 仓库</Text>
              <a href={selectedSkill.repoUrl} target="_blank" rel="noopener noreferrer">
                <Text code>{selectedSkill.repoUrl}</Text>
              </a>
            </Card>

            <Card style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)', border: 'none' }}>
              <Text style={{ color: 'white', fontSize: 12, display: 'block', marginBottom: 8 }}>安装命令</Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: 'white', fontFamily: 'monospace', fontSize: 14, flex: 1 }}>
                  {selectedSkill.installCommand}
                </Text>
                <Tooltip title="复制">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    style={{ color: 'white' }}
                    onClick={() => copyInstallCommand(selectedSkill.installCommand)}
                  />
                </Tooltip>
              </div>
            </Card>
          </div>
        )}
      </Modal>

      <Modal title={editingPrompt ? '编辑提示词' : '添加提示词'} open={promptModalVisible} onOk={handleSavePrompt} onCancel={() => setPromptModalVisible(false)} okText="保存" cancelText="取消">
        <Form form={promptForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="请输入提示词名称" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea placeholder="请输入描述" rows={2} /></Form.Item>
          <Form.Item name="content" label="提示词内容"><Input.TextArea placeholder="请输入完整的提示词内容" rows={8} /></Form.Item>
          <Form.Item name="icon" label="图标 (emoji)"><Input placeholder="如：💬" /></Form.Item>
          <Form.Item name="category" label="分类"><Input placeholder="如：开发工具" /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingExternalSkill ? '编辑 Skill' : '添加 Skill'} open={externalSkillModalVisible} onOk={handleSaveExternalSkill} onCancel={() => setExternalSkillModalVisible(false)} okText="保存" cancelText="取消">
        <Form form={externalSkillForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="请输入 Skill 名称" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea placeholder="请输入描述" rows={3} /></Form.Item>
          <Form.Item name="icon" label="图标 (emoji)"><Input placeholder="如：🛠️" /></Form.Item>
          <Form.Item name="category" label="分类"><Input placeholder="如：开发工具" /></Form.Item>
          <Form.Item name="author" label="作者"><Input placeholder="GitHub 用户名" /></Form.Item>
          <Form.Item name="repoUrl" label="GitHub 仓库" rules={[{ required: true }]}><Input placeholder="https://github.com/xxx/xxx-skills" /></Form.Item>
          <Form.Item name="installCommand" label="安装命令" rules={[{ required: true }]}><Input placeholder="npx skills add xxx/xxx-skills" /></Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
}