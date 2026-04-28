'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Steps,
  Card,
  Upload,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Typography,
  Space,
  Tag,
  message,
  Alert,
  Descriptions,
  Divider,
  Modal,
  Collapse,
  Slider,
  Switch,
  Radio,
  Layout,
} from 'antd';
import {
  InboxOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  DownOutlined,
  SettingOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
  FolderOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { UploadFile, RcFile } from 'antd/es/upload';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import type {
  DocType,
  SecLevel,
  PipelineStep,
  PipelineSubStep,
  DocACL,
  KnowledgeDoc,
  KnowledgeSpace,
  ChunkConfig,
  ChunkMode,
} from '@/types';
import { listSpaces } from '@/api/knowledge-space';
import CommandBar from '@/components/LUI/CommandBar';
import type { LUIAction } from '@/types';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Dragger } = Upload;
const { Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: 'home', icon: <FileTextOutlined />, label: '知识库', path: '/' },
  { key: 'spaces', icon: <FolderOutlined />, label: '知识空间', path: '/spaces/list' },
  { key: 'docs', icon: <FileTextOutlined />, label: '文档管理', path: '/documents/list' },
  { key: 'upload', icon: <CloudUploadOutlined />, label: '上传文档', path: '/documents/upload' },
  { key: 'chat', icon: <RobotOutlined />, label: '知识问答', path: '/rag' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置', path: '/settings' },
];

// ============== Mock 数据 ==============
const MOCK_DOC_ID = 'DOC20260427001';
const MOCK_TENANT_ID = 'tenant-demo-001';

// 详细流水线进度（带子步骤）
const MOCK_PIPELINE_STEPS: PipelineStep[] = [
  {
    title: '文件上传',
    description: 'MinIO presigned URL 直传完成',
    status: 'finish',
    timestamp: '2026-04-27 14:30:05',
    subSteps: [
      { label: '获取 presigned URL', status: 'finish', detail: '来自 kb-gateway' },
      { label: '文件直传至 MinIO', status: 'finish', detail: '大小: 2.1 MB' },
      { label: '生成 docId', status: 'finish', detail: MOCK_DOC_ID },
    ],
  },
  {
    title: '文档解析',
    description: 'TikaParser 正在提取文本内容...',
    status: 'process',
    timestamp: '2026-04-27 14:30:12',
    subSteps: [
      { label: 'TikaParser 文本提取', status: 'process', detail: '正在处理第 1/15 页...' },
      { label: '文档元数据识别', status: 'wait', detail: '标题、作者、创建时间' },
      // PHASE2: 段落结构检测（SemanticChunker 依赖）
      { label: '段落结构检测', status: 'wait', detail: '# PHASE2 占位: SemanticChunker' },
    ],
  },
  {
    title: '文本清洗',
    description: '去除特殊字符与冗余内容...',
    status: 'wait',
    subSteps: [
      { label: '特殊字符过滤', status: 'wait', detail: '移除控制字符、异常编码' },
      { label: '冗余内容去除', status: 'wait', detail: '页眉页脚、空白行、重复符号' },
      { label: '格式标准化', status: 'wait', detail: '统一换行符、编码 UTF-8' },
      { label: '空格规范化', status: 'wait', detail: '中英文空格、全角半角转换' },
    ],
  },
  {
    title: '智能切片',
    description: 'FixedLengthChunker 切片中 (512 token, 10%重叠)...',
    status: 'wait',
    subSteps: [
      { label: '固定长度分块', status: 'wait', detail: 'chunk_size=512 token, overlap=10%' },
      { label: '重叠窗口处理', status: 'wait', detail: '相邻 chunk 保留 51 token 重叠' },
      { label: '生成切片列表', status: 'wait', detail: '预计生成 12 个 chunks' },
    ],
  },
  {
    title: '向量化入库',
    description: 'BGE 向量化 + Milvus upsert...',
    status: 'wait',
    subSteps: [
      { label: 'BGE 向量生成', status: 'wait', detail: 'model=bge-zh-v1.5, dim=1024' },
      { label: 'Milvus upsert', status: 'wait', detail: 'partition=tenant-demo-001' },
      { label: '写入向量数据库', status: 'wait', detail: 'collection=kb_docs' },
    ],
  },
];

// ============== 页面组件 ==============
export default function UploadPage() {
  const [form] = Form.useForm();
  const pathname = usePathname();
  const [currentStep, setCurrentStep] = useState(0); // 0=填写表单 1=上传文件 2=流水线
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<PipelineStep[]>(MOCK_PIPELINE_STEPS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string>('DEFAULT');
  const [useCustomChunk, setUseCustomChunk] = useState(false);
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig>({
    useSpaceConfig: true,
    chunkSize: 512,
    overlapRatio: 10,
    chunkMode: 'HEAD_FIRST',
  });

  // 加载知识空间列表
  useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch(() => message.error('加载知识空间失败'));
  }, []);

  // 知识空间变更处理
  const handleSpaceChange = (spaceId: string) => {
    setSelectedSpace(spaceId);
    const space = spaces.find(s => s.id === spaceId);
    if (space && chunkConfig.useSpaceConfig) {
      setChunkConfig({
        ...chunkConfig,
        chunkSize: space.chunkSize,
        overlapRatio: space.overlapRatio,
        chunkMode: space.chunkMode,
      });
    }
  };

  // 切片规则切换
  const handleChunkConfigToggle = (useCustom: boolean) => {
    setUseCustomChunk(useCustom);
    if (!useCustom && selectedSpace !== 'DEFAULT') {
      const space = spaces.find(s => s.id === selectedSpace);
      if (space) {
        setChunkConfig({
          useSpaceConfig: true,
          chunkSize: space.chunkSize,
          overlapRatio: space.overlapRatio,
          chunkMode: space.chunkMode,
        });
      }
    }
  };

  // ============== LUI Action Handler ==============
  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'OPEN_MODAL' && action.payload.modal === 'upload') {
      message.success('已通过智能指令打开上传界面');
    }
    if (action.type === 'CALL_SKILL') {
      const skillId = action.payload.skillId as string;
      if (skillId === 'skill-upload') {
        message.success('已调用「文档上传」技能，请选择文件并填写元数据');
        setCurrentStep(0);
      }
    }
  }, []);

  // ============== 文件上传 Props ==============
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: (file: RcFile) => {
      const isLimit = file.size / 1024 / 1024 <= 5;
      if (!isLimit) {
        message.error('文件大小不能超过 5MB');
        return false;
      }
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/markdown',
      ];
      const isAllowed = allowedTypes.includes(file.type);
      if (!isAllowed) {
        message.error('暂不支持该文件类型，仅支持 PDF/Word/PPT/Excel/TXT/MD');
        return false;
      }
      setFileList([{ uid: '-1', name: file.name, status: 'done', size: file.size } as UploadFile]);
      return false; // prevent auto upload
    },
    onRemove: () => {
      setFileList([]);
    },
    fileList,
  };

  // ============== 提交元数据 ==============
  const handleCommit = async () => {
    try {
      const values = await form.validateFields();
      if (fileList.length === 0) {
        message.warning('请先选择要上传的文件');
        return;
      }
      setCurrentStep(1);
      message.success('元数据已提交，正在触发入库流水线...');
    } catch {
      message.error('请完善必填信息');
    }
  };

  // ============== 模拟流水线进度（带子步骤） ==============
  const simulatePipeline = async () => {
    setIsSimulating(true);
    setUploadProgress([...MOCK_PIPELINE_STEPS]);

    // 主步骤索引：0=上传(已完成), 1=解析, 2=清洗, 3=切片, 4=向量化
    const stepOrder = [1, 2, 3, 4];
    // 每个主步骤的子步骤索引范围
    const subStepRanges: Record<number, number[]> = {
      1: [0, 1, 2], // 解析: 3个子步骤
      2: [0, 1, 2, 3], // 清洗: 4个子步骤
      3: [0, 1, 2], // 切片: 3个子步骤
      4: [0, 1, 2], // 向量化: 3个子步骤
    };

    for (let i = 0; i < stepOrder.length; i++) {
      const mainStepIdx = stepOrder[i];
      const subIndices = subStepRanges[mainStepIdx];

      // 逐个完成子步骤
      for (let j = 0; j < subIndices.length; j++) {
        await new Promise((r) => setTimeout(r, 600));

        setUploadProgress((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as PipelineStep[];

          // 标记当前子步骤完成
          if (updated[mainStepIdx].subSteps) {
            updated[mainStepIdx].subSteps[j].status = 'finish';
          }

          // 下一个子步骤开始（如果不是最后一个子步骤）
          if (j + 1 < subIndices.length) {
            updated[mainStepIdx].subSteps![j + 1].status = 'process';
          }

          return updated;
        });
      }

      // 主步骤全部完成，进入下一个主步骤
      await new Promise((r) => setTimeout(r, 400));

      setUploadProgress((prev) => {
        const updated = [...prev];
        // 当前主步骤标记完成
        updated[mainStepIdx] = {
          ...updated[mainStepIdx],
          status: 'finish',
          description: updated[mainStepIdx].description.replace('正在', '').replace('...', '完成'),
          timestamp: new Date().toLocaleString('zh-CN'),
        };

        // 下一个主步骤开始处理
        if (i + 1 < stepOrder.length) {
          const nextStepIdx = stepOrder[i + 1];
          updated[nextStepIdx] = {
            ...updated[nextStepIdx],
            status: 'process',
            timestamp: new Date().toLocaleString('zh-CN'),
          };
          // 下一个主步骤的第一个子步骤开始
          if (updated[nextStepIdx].subSteps) {
            updated[nextStepIdx].subSteps[0].status = 'process';
          }
        }

        return updated;
      });
    }

    setIsSimulating(false);
    message.success('🎉 文档入库完成，已进入可检索状态！');
  };

  // ============== 渲染流水线步骤图标 ==============
  const stepIcon = (status: PipelineStep['status']) => {
    if (status === 'finish') return <CheckCircleFilled style={{ color: '#52c41a' }} />;
    if (status === 'error') return <CloseCircleFilled style={{ color: '#ff4d4f' }} />;
    if (status === 'process') return <LoadingOutlined style={{ color: '#1677ff' }} />;
    return null;
  };

  return (
    <div style={{ padding: 24 }}>
      {/* 智能指令条 */}
      <CommandBar onAction={handleLUIAction} />

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>文档上传与入库</Title>
            <Tag color="blue">MVP Pipeline Demo</Tag>
          </Space>
        }
        style={{ borderRadius: 8 }}
        extra={
          <Space>
            <Button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}>上一步</Button>
            <Button type="primary" onClick={() => setCurrentStep(Math.min(2, currentStep + 1))}>
              下一步
            </Button>
          </Space>
        }
      >
        {/* 步骤条 */}
        <Steps
          current={currentStep}
          items={[
            { title: '填写元数据' },
            { title: '选择文件' },
            { title: '流水线进度' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {/* ========== Step 0: 填写元数据 ========== */}
        {currentStep === 0 && (
          <div>
            <Alert
              message="元数据填写说明"
              description="以下信息将用于文档分类、权限分配和检索过滤。请确保信息准确。"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                docType: 'REGULATION',
                bizDomain: 'COMPLIANCE',
                regionCode: 'CN-NATIONAL',
                secLevel: 1,
                effectiveFrom: dayjs(),
                ownerUid: 'current-user',
                deptId: 'D01',
              }}
            >
              <Form.Item
                name="filename"
                label="文件名（自动填充）"
                tooltip="选择文件后将自动填充"
              >
                <Input placeholder="请先在下一步选择文件" disabled />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="docType" label="文档类型" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="REGULATION">制度</Select.Option>
                    <Select.Option value="POLICY">政策</Select.Option>
                    <Select.Option value="AUDIT">审计</Select.Option>
                    <Select.Option value="CONTRACT">合同</Select.Option>
                    <Select.Option value="MANUAL">手册</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item name="bizDomain" label="业务域" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="COMPLIANCE">合规</Select.Option>
                    <Select.Option value="HR">人力资源</Select.Option>
                    <Select.Option value="FINANCE">财务</Select.Option>
                    <Select.Option value="IT">信息技术</Select.Option>
                    <Select.Option value="OPS">运营</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item name="regionCode" label="适用地域" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="CN-NATIONAL">全国</Select.Option>
                    <Select.Option value="CN-EAST">华东</Select.Option>
                    <Select.Option value="CN-SOUTH">华南</Select.Option>
                    <Select.Option value="CN-NORTH">华北</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item name="secLevel" label="密级" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value={1}>🌍 公开 (1)</Select.Option>
                    <Select.Option value={2}>🔒 内部 (2)</Select.Option>
                    <Select.Option value={3}>🔐 机密 (3)</Select.Option>
                    <Select.Option value={4}>🔒 秘密 (4)</Select.Option>
                    <Select.Option value={5}>🛡️ 绝密 (5)</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item name="effectiveFrom" label="生效日期" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="effectiveTo" label="失效日期（选填）">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="ownerUid" label="上传者">
                  <Input disabled />
                </Form.Item>

                <Form.Item name="deptId" label="所属部门">
                  <Select>
                    <Select.Option value="D01">技术部</Select.Option>
                    <Select.Option value="D02">合规部</Select.Option>
                    <Select.Option value="D03">财务部</Select.Option>
                    <Select.Option value="D04">人力资源部</Select.Option>
                  </Select>
                </Form.Item>
              </div>

              <Form.Item name="labelTags" label="标签（选填）">
                <Select mode="tags" placeholder="输入标签后回车添加" />
              </Form.Item>

              <Divider><SettingOutlined /> 切片规则配置</Divider>

              <Form.Item label="知识空间" required>
                <Select
                  value={selectedSpace}
                  onChange={handleSpaceChange}
                  placeholder="请选择知识空间"
                >
                  {spaces.map(space => (
                    <Select.Option key={space.id} value={space.id}>
                      {space.name} {space.id === 'DEFAULT' ? '(系统默认)' : ''}
                      {space.docCount !== undefined && ` - ${space.docCount} 文档`}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="切片规则">
                <Radio.Group
                  value={useCustomChunk}
                  onChange={(e) => handleChunkConfigToggle(e.target.value)}
                >
                  <Radio value={false}>继承知识空间配置</Radio>
                  <Radio value={true}>自定义配置</Radio>
                </Radio.Group>
              </Form.Item>

              {useCustomChunk && (
                <Card size="small" style={{ background: '#fafafa', marginBottom: 16 }}>
                  <Form.Item label="段长度" style={{ marginBottom: 12 }}>
                    <Slider
                      min={100}
                      max={2000}
                      step={50}
                      value={chunkConfig.chunkSize}
                      onChange={(val) => setChunkConfig({ ...chunkConfig, chunkSize: val })}
                      marks={{ 100: '100', 512: '512', 1000: '1000', 2000: '2000' }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前: {chunkConfig.chunkSize} 字符
                    </Text>
                  </Form.Item>

                  <Form.Item label="重叠率" style={{ marginBottom: 12 }}>
                    <Slider
                      min={0}
                      max={50}
                      step={5}
                      value={chunkConfig.overlapRatio}
                      onChange={(val) => setChunkConfig({ ...chunkConfig, overlapRatio: val })}
                      marks={{ 0: '0%', 10: '10%', 25: '25%', 50: '50%' }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前: {chunkConfig.overlapRatio}%
                    </Text>
                  </Form.Item>

                  <Form.Item label="切片模式" style={{ marginBottom: 0 }}>
                    <Select
                      value={chunkConfig.chunkMode}
                      onChange={(val) => setChunkConfig({ ...chunkConfig, chunkMode: val as ChunkMode })}
                      style={{ width: 200 }}
                    >
                      <Select.Option value="HEAD_FIRST">从前到后</Select.Option>
                      <Select.Option value="TAIL_FIRST">从后到前</Select.Option>
                      <Select.Option value="UNIFORM">均匀切分</Select.Option>
                    </Select>
                  </Form.Item>
                </Card>
              )}

              <Form.Item label="覆盖重名文档">
                <Switch checkedChildren="开" unCheckedChildren="关" />
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  开启后，如存在同名文档将自动覆盖
                </Text>
              </Form.Item>

              <Divider>权限配置 (ACL)</Divider>

              <Alert
                message="MVP 阶段使用简化的权限配置。详细权限管理将在阶段二实现。"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item label="可见范围">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前选中：仅本人可见。多人/多部门权限配置可在文档列表页编辑。
                </Text>
              </Form.Item>

              <Form.Item>
                <Button type="primary" size="large" block onClick={handleCommit}>
                  确认元数据，进入文件选择
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {/* ========== Step 1: 选择文件 ========== */}
        {currentStep === 1 && (
          <div>
            <Alert
              message="文件要求"
              description="支持格式：PDF / Word / PPT / Excel / TXT / MD，单个文件 ≤ 5MB。MVP 阶段暂不支持扫描件（OCR）。"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Dragger {...uploadProps} style={{ padding: '32px 0', borderRadius: 8 }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                支持单个文件上传，请确保文件内容为文字型文档（非扫描件）
              </p>
            </Dragger>

            {fileList.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Descriptions title="待上传文件" column={2} bordered size="small">
                  <Descriptions.Item label="文件名">{fileList[0].name}</Descriptions.Item>
                  <Descriptions.Item label="文件大小">
                    {(fileList[0].size! / 1024).toFixed(1)} KB
                  </Descriptions.Item>
                  <Descriptions.Item label="文档ID">{MOCK_DOC_ID}</Descriptions.Item>
                  <Descriptions.Item label="租户ID">{MOCK_TENANT_ID}</Descriptions.Item>
                </Descriptions>

                <Button
                  type="primary"
                  size="large"
                  block
                  style={{ marginTop: 24 }}
                  onClick={() => {
                    setCurrentStep(2);
                    simulatePipeline();
                  }}
                  icon={<InboxOutlined />}
                >
                  触发入库流水线
                </Button>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Button onClick={() => setCurrentStep(0)}>返回修改元数据</Button>
            </div>
          </div>
        )}

        {/* ========== Step 2: 流水线进度 ========== */}
        {currentStep === 2 && (
          <div>
            <Alert
              message="流水线处理中"
              description={
                isSimulating
                  ? '系统正在执行：解析 → 清洗 → 切片 → 向量化入库，预计耗时 2-5 分钟...'
                  : '入库流程已完成，文档已进入可检索状态'
              }
              type={isSimulating ? 'info' : 'success'}
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Card
              title="🔄 文档入库流水线"
              style={{ marginBottom: 24, background: '#fafafa' }}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {uploadProgress.map((step, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{
                      background: step.status === 'process' ? '#e6f4ff' : '#fafafa',
                      border: step.status === 'process' ? '1px solid #91caff' : '1px solid #f0f0f0',
                    }}
                  >
                    {/* 主步骤头部 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space>
                        {stepIcon(step.status)}
                        <Text strong style={{ fontSize: 14 }}>{step.title}</Text>
                        {step.status === 'process' && (
                          <Tag color="processing" style={{ fontSize: 11 }}>处理中</Tag>
                        )}
                        {step.status === 'wait' && (
                          <Tag style={{ fontSize: 11 }}>等待中</Tag>
                        )}
                        {step.status === 'finish' && (
                          <Tag color="success" style={{ fontSize: 11 }}>已完成</Tag>
                        )}
                        {step.status === 'error' && (
                          <Tag color="error" style={{ fontSize: 11 }}>失败</Tag>
                        )}
                      </Space>
                      <Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {step.description}
                        </Text>
                        {step.timestamp && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            ⏱ {step.timestamp}
                          </Text>
                        )}
                      </Space>
                    </div>

                    {/* 子步骤详情（使用 Collapse 展示） */}
                    {step.subSteps && step.subSteps.length > 0 && (
                      <Collapse
                        ghost
                        size="small"
                        style={{ marginTop: 12 }}
                        expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} />}
                        items={[
                          {
                            key: String(index),
                            label: (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                查看详情 ({step.subSteps.filter(s => s.status === 'finish').length}/{step.subSteps.length} 完成)
                              </Text>
                            ),
                            children: (
                              <div style={{ paddingLeft: 8 }}>
                                {step.subSteps.map((sub, subIdx) => (
                                  <div
                                    key={subIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '6px 0',
                                      borderLeft: sub.status === 'process' ? '2px solid #1677ff' : '2px solid transparent',
                                      paddingLeft: sub.status === 'process' ? 12 : 14,
                                    }}
                                  >
                                    {sub.status === 'finish' && (
                                      <CheckCircleFilled style={{ color: '#52c41a', marginRight: 8, fontSize: 12 }} />
                                    )}
                                    {sub.status === 'process' && (
                                      <LoadingOutlined style={{ color: '#1677ff', marginRight: 8, fontSize: 12 }} />
                                    )}
                                    {sub.status === 'wait' && (
                                      <div style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        border: '1px solid #d9d9d9',
                                        marginRight: 8,
                                      }} />
                                    )}
                                    <Text style={{ fontSize: 13, color: sub.status === 'process' ? '#1677ff' : undefined }}>
                                      {sub.label}
                                    </Text>
                                    {sub.detail && (
                                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                        {sub.detail}
                                      </Text>
                                    )}
                                    {sub.status === 'process' && (
                                      <Tag color="processing" style={{ marginLeft: 8, fontSize: 10 }}>执行中</Tag>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ),
                          },
                        ]}
                      />
                    )}
                  </Card>
                ))}
              </Space>
            </Card>

            {/* 处理结果汇总 */}
            {uploadProgress.every((s) => s.status === 'finish') && (
              <Card title="📋 入库结果" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Descriptions column={2}>
                  <Descriptions.Item label="文档ID">
                    <Text code>{MOCK_DOC_ID}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="版本号">v1</Descriptions.Item>
                  <Descriptions.Item label="处理耗时">约 4.8 秒</Descriptions.Item>
                  <Descriptions.Item label="生成切片数">12 chunks</Descriptions.Item>
                  <Descriptions.Item label="向量维度">1024 (BGE-zh-v1.5)</Descriptions.Item>
                  <Descriptions.Item label="Milvus 分区">
                    <Tag>tenant-demo-001</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color="success" icon={<CheckCircleFilled />}>
                      READY — 可被检索
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="可检索时间">
                    <Text type="success">约 5 分钟内（当前 4.8s）</Text>
                  </Descriptions.Item>
                </Descriptions>

                <Divider />

                <Space>
                  <Button type="primary">查看文档详情</Button>
                  <Button>继续上传</Button>
                  <Button>进入知识问答</Button>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Button onClick={() => setCurrentStep(1)}>返回上传</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
