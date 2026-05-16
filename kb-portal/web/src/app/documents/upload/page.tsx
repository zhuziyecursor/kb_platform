'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Steps,
  Card,
  Upload,
  Form,
  Input,
  Select,
  Button,
  Typography,
  Space,
  Tag,
  App,
  Alert,
  Descriptions,
  Divider,
  Collapse,
  Slider,
  Switch,
  Radio,
} from 'antd';
import {
  InboxOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  DownOutlined,
  SettingOutlined,
  TagsOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { UploadFile, RcFile } from 'antd/es/upload';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import type {
  DocType,
  SecLevel,
  PipelineStep,
  KnowledgeSpace,
  ChunkConfig,
  ChunkMode,
} from '@/types';
import { listSpaces } from '@/api/knowledge-space';
import {
  initUpload,
  verifyUpload,
  commitDoc,
  ingestDoc,
  getDocStatus,
  uploadFile,
  getErrorMessage,
  InitUploadRequest,
  CommitRequest,
} from '@/api/http-client';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import type { LUIAction } from '@/types';
import { useRouter } from 'next/navigation';

const { Text } = Typography;
const { Dragger } = Upload;


// ============== 常量 ==============
const EMBEDDING_MODEL = 'BGE-zh-v1.5';
const EMBEDDING_DIM = 1024;

type AutoUploadMetadata = {
  filename: string;
  docType: DocType;
  bizDomain: string;
  regionCode: string;
  secLevel: SecLevel;
  effectiveFrom: dayjs.Dayjs;
  ownerUid: string;
  deptId: string;
  labelTags: string[];
};

const DEFAULT_AUTO_METADATA: Omit<AutoUploadMetadata, 'filename' | 'labelTags'> = {
  docType: 'REGULATION',
  bizDomain: 'COMPLIANCE',
  regionCode: 'CN-NATIONAL',
  secLevel: 1,
  effectiveFrom: dayjs(),
  ownerUid: 'current-user',
  deptId: 'D01',
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  REGULATION: '制度',
  POLICY: '政策',
  AUDIT: '审计',
  CONTRACT: '合同',
  MANUAL: '手册',
};

const BIZ_DOMAIN_LABELS: Record<string, string> = {
  COMPLIANCE: '合规',
  HR: '人力资源',
  FINANCE: '财务',
  IT: '信息技术',
  OPS: '运营',
};

const SEC_LEVEL_LABELS: Record<SecLevel, string> = {
  1: '公开',
  2: '内部',
  3: '机密',
  4: '秘密',
  5: '绝密',
};

const FILE_TYPE_TAGS: Record<string, string> = {
  pdf: 'PDF',
  doc: 'Word',
  docx: 'Word',
  ppt: 'PPT',
  pptx: 'PPT',
  xls: 'Excel',
  xlsx: 'Excel',
  txt: 'TXT',
  md: 'Markdown',
  html: 'HTML',
  htm: 'HTML',
};

const getFileExtension = (filename: string) => {
  const match = filename.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] || '';
};

const stripFileExtension = (filename: string) => filename.replace(/\.[^.]+$/, '');

const inferDocType = (filename: string): DocType => {
  if (/合同|协议|契约|订单/.test(filename)) return 'CONTRACT';
  if (/审计|内控|检查|整改|问题/.test(filename)) return 'AUDIT';
  if (/手册|指南|指引|流程|说明|操作/.test(filename)) return 'MANUAL';
  if (/政策|办法|意见|通知/.test(filename)) return 'POLICY';
  return 'REGULATION';
};

const inferBizDomain = (filename: string) => {
  if (/财务|资金|预算|报销|会计|税务|投资/.test(filename)) return 'FINANCE';
  if (/人力|人事|员工|招聘|薪酬|绩效/.test(filename)) return 'HR';
  if (/信息|系统|数据|网络|安全|技术|IT/i.test(filename)) return 'IT';
  if (/运营|服务|仓储|采购|供应链|贸易|项目/.test(filename)) return 'OPS';
  return 'COMPLIANCE';
};

const inferSecLevel = (filename: string): SecLevel => {
  if (/绝密/.test(filename)) return 5;
  if (/秘密/.test(filename)) return 4;
  if (/机密/.test(filename)) return 3;
  if (/内部/.test(filename)) return 2;
  return 1;
};

const inferTags = (filename: string, docType: DocType, bizDomain: string) => {
  const baseName = stripFileExtension(filename);
  const extension = getFileExtension(filename);
  const keywordTags = baseName
    .split(/[\s,，、_\-—–/\\()[\]（）【】《》]+/)
    .map(tag => tag.trim())
    .filter(tag => tag.length >= 2 && tag.length <= 12)
    .slice(0, 4);

  return Array.from(new Set([
    DOC_TYPE_LABELS[docType],
    BIZ_DOMAIN_LABELS[bizDomain] || bizDomain,
    FILE_TYPE_TAGS[extension],
    ...keywordTags,
  ].filter(Boolean)));
};

const buildAutoMetadata = (
  file: File,
  currentValues: Record<string, any> = {},
): AutoUploadMetadata => {
  const docType = inferDocType(file.name);
  const bizDomain = inferBizDomain(file.name);
  const autoTags = inferTags(file.name, docType, bizDomain);
  const manualTags = Array.isArray(currentValues.labelTags) ? currentValues.labelTags : [];

  return {
    ...DEFAULT_AUTO_METADATA,
    filename: file.name,
    docType,
    bizDomain,
    secLevel: inferSecLevel(file.name),
    labelTags: Array.from(new Set([...manualTags, ...autoTags])),
  };
};

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
      { label: '生成 docId', status: 'finish', detail: '等待生成...' },
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
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0); // 0=填写表单 1=上传文件 2=流水线
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<PipelineStep[]>(MOCK_PIPELINE_STEPS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string>('DEFAULT');
  const [useCustomChunk, setUseCustomChunk] = useState(false);
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig>({
    useSpaceConfig: true,
    chunkSize: 512,
    overlapRatio: 10,
    chunkMode: 'HEAD_FIRST',
  });

  // 实际上传流程状态
  const [docId, setDocId] = useState<string>('');
  const [version, setVersion] = useState<number>(1);
  const [tenantId] = useState<string>('dev-tenant-001');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // 加载知识空间列表
  useEffect(() => {
    listSpaces()
      .then((items) => {
        setSpaces(items);
        if (!items.some(space => space.id === selectedSpace) && items.length > 0) {
          setSelectedSpace(items[0].id);
        }
      })
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
        message.success('已调用「文档上传」技能，请选择知识空间并上传文件');
        setCurrentStep(0);
      }
    }
  }, []);

  // ============== 文件上传 Props ==============
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: (file: RcFile) => {
      const isLimit = file.size / 1024 / 1024 <= 50;
      if (!isLimit) {
        message.error('文件大小不能超过 50MB');
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
        'text/html',
      ];
      const allowedExtensions = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'html', 'htm'];
      const isAllowed = allowedTypes.includes(file.type) || allowedExtensions.includes(getFileExtension(file.name));
      if (!isAllowed) {
        message.error('暂不支持该文件类型，仅支持 PDF/Word/PPT/Excel/TXT/MD/HTML');
        return false;
      }
      // 重要：保留 originFileObj 引用，这是 antd 内部访问实际 File 对象的途径
      // 当 beforeUpload 返回 false 时，需要将文件对象（含 originFileObj）放入 fileList
      const uploadFile: UploadFile = {
        ...file,
        uid: '-1',
        name: file.name,
        status: 'done',
        size: file.size,
        originFileObj: file as any,
      };
      const autoMetadata = buildAutoMetadata(file, form.getFieldsValue(true));
      form.setFieldsValue({
        filename: autoMetadata.filename,
        labelTags: autoMetadata.labelTags,
      });
      setFormValues(prev => ({ ...prev, ...autoMetadata }));
      setFileList([uploadFile]);
      return false; // prevent auto upload
    },
    onRemove: () => {
      setFileList([]);
    },
    fileList,
  };

  // ============== 计算文件 SHA256（使用 FileReader） ==============
  const computeFileHash = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer;
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // ============== Step 0: 确认元数据 → 进入文件选择 ==============
  const handleMetadataConfirm = async () => {
    try {
      const values = await form.validateFields();
      setFormValues(values);
      setOverwriteExisting(values.overwriteExisting || false);
      setCurrentStep(1);
    } catch {
      message.error('请完善必填信息');
    }
  };

  // ============== Step 1: 选择文件后 → 调用 init-upload → presigned URL 直传 → verify → commit → ingest ==============
  const handleUploadTrigger = async () => {
    if (fileList.length === 0 || !fileList[0].originFileObj) {
      message.warning('请先选择文件');
      return;
    }

    setIsProcessing(true);
    setElapsedSeconds(null);
    startTimeRef.current = Date.now();
    setCurrentStep(2);
    setUploadProgress([...MOCK_PIPELINE_STEPS]);

    try {
      const file = fileList[0].originFileObj as File;
      const fileHash = await computeFileHash(file);
      const uploadMetadata = buildAutoMetadata(file, {
        ...formValues,
        ...form.getFieldsValue(true),
      });
      setFormValues(uploadMetadata);

      // 1. 调用 init-upload 获取 presigned URL
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], status: 'process', timestamp: new Date().toLocaleString('zh-CN') };
        if (updated[0].subSteps) updated[0].subSteps[0] = { label: '调用 init-upload', status: 'process', detail: '获取 presigned URL...' };
        return updated;
      });

      const initReq: InitUploadRequest = {
        tenantId: tenantId,
        filename: file.name,
        fileSize: file.size,
        fileHash: fileHash,
        docType: uploadMetadata.docType,
        bizDomain: uploadMetadata.bizDomain,
        regionCode: uploadMetadata.regionCode,
        secLevel: uploadMetadata.secLevel,
        effectiveFrom: uploadMetadata.effectiveFrom.format('YYYY-MM-DD'),
        ownerUid: uploadMetadata.ownerUid,
        deptId: uploadMetadata.deptId,
        knowledgeSpaceId: selectedSpace,
        labelTags: uploadMetadata.labelTags.join(',') || undefined,
        chunkConfig: {
          useSpaceConfig: !useCustomChunk,
          chunkSize: chunkConfig.chunkSize,
          overlapRatio: chunkConfig.overlapRatio,
          chunkMode: chunkConfig.chunkMode,
        },
        overwriteExisting: overwriteExisting,
      };

      const initResp = await initUpload(initReq);
      setDocId(initResp.docId);
      setVersion(1);

      // 更新步骤：获取 presigned URL 完成
      setUploadProgress(prev => {
        const updated = [...prev];
        if (updated[0].subSteps) {
          updated[0].subSteps[0] = { label: '获取 presigned URL', status: 'finish', detail: initResp.docId };
        }
        updated[0].subSteps![1] = { label: '文件上传至后端', status: 'process', detail: 'POST 上传...' };
        return updated;
      });

      // 2. 使用后端代理接口上传文件到 MinIO（避免 CORS 问题）
      const uploadResp = await uploadFile(initResp.docId, version, file);

      if (!uploadResp.success) {
        throw new Error(`文件上传失败: ${uploadResp.message}`);
      }

      // 更新步骤：文件上传完成
      setUploadProgress(prev => {
        const updated = [...prev];
        if (updated[0].subSteps) {
          updated[0].subSteps[1] = { label: '文件上传至后端', status: 'finish', detail: `${(file.size / 1024).toFixed(1)} KB` };
          updated[0].subSteps[2] = { label: '生成 docId', status: 'finish', detail: initResp.docId };
        }
        updated[0] = { ...updated[0], status: 'finish', description: '后端代理上传完成', timestamp: new Date().toLocaleString('zh-CN') };
        return updated;
      });

      // 3. 调用 verify-upload
      await verifyUpload(initResp.docId, version);

      // 4. 调用 commit
      const commitReq: CommitRequest = {
        tenantId: tenantId,
        sha256: fileHash,
        acl: [{
          accessorType: 'USER',
          accessorId: uploadMetadata.ownerUid,
          permission: 'WRITE',
        }],
      };
      const commitResp = await commitDoc(initResp.docId, version, commitReq);

      // 5. 根据 commit 返回状态判断是否需要触发 ingest
      if (commitResp.status === 'PENDING') {
        await ingestDoc(initResp.docId, version);
      }

      // 进入状态轮询
      startStatusPolling(initResp.docId, version, file.size);

    } catch (err) {
      const detail = getErrorMessage(err, '未知错误');
      console.error('上传失败详情:', err);
      message.error(`上传失败: ${detail}`);
      setIsProcessing(false);

      // 标记失败
      setUploadProgress(prev => prev.map(step => ({
        ...step,
        status: step.status === 'process' ? 'error' : step.status,
      })));
    }
  };

  // ============== 轮询文档状态 ==============
  const startStatusPolling = (docId: string, ver: number, fileSize: number) => {
    const poll = async () => {
      try {
        const status = await getDocStatus(docId, ver);

        setUploadProgress(prev => {
          const updated = [...prev];

          // 根据状态更新流水线显示
          if (status.status === 'PROCESSING' || status.status === 'PENDING') {
            // 更新解析步骤为进行中
            if (updated[1].status !== 'finish') {
              updated[1] = { ...updated[1], status: 'process', timestamp: new Date().toLocaleString('zh-CN') };
              if (updated[1].subSteps) {
                updated[1].subSteps[0] = { label: 'TikaParser 文本提取', status: 'process', detail: '正在处理...' };
              }
            }
          }

          if (status.status === 'READY') {
            // 所有步骤完成
            updated.forEach(u => { u.status = 'finish'; });
            const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
            setElapsedSeconds(parseFloat(elapsed));
            message.success('文档入库完成，已进入可检索状态！');
            setIsProcessing(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
          }

          if (status.status === 'FAILED') {
            updated.forEach(u => { u.status = 'error'; });
            message.error(`处理失败: ${status.lastError || '未知错误'}`);
            setIsProcessing(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
          }

          return updated;
        });

      } catch (err) {
        console.error('轮询状态失败:', err);
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll();
  };

  // ============== 渲染流水线步骤图标 ==============
  const stepIcon = (status: PipelineStep['status']) => {
    if (status === 'finish') return <CheckCircleFilled style={{ color: 'var(--color-success)' }} />;
    if (status === 'error') return <CloseCircleFilled style={{ color: 'var(--color-destructive)' }} />;
    if (status === 'process') return <LoadingOutlined style={{ color: 'var(--color-accent)' }} />;
    return null;
  };

  return (
    <AppLayout>
        {/* 智能指令条 */}
        <CommandBar onAction={handleLUIAction} />

      <PageHeader
        breadcrumbs={[
          { title: '知识库' },
          { title: '文档管理', href: '/documents/list' },
          { title: '上传文档' },
        ]}
        title="文档上传与入库"
        description="上传文档到知识库，系统自动完成解析、切片、向量化入库，5分钟内可检索"
        actions={
          <Space>
            <Button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0 || isProcessing}>
              上一步
            </Button>
            {currentStep === 0 && (
              <Button type="primary" onClick={handleMetadataConfirm}>
                进入文件选择
              </Button>
            )}
          </Space>
        }
      />

      <Card style={{ borderRadius: 'var(--radius-lg)' }}>
        {/* 步骤条 */}
        <Steps
          current={currentStep}
          items={[
            { title: '选择空间与标签' },
            { title: '选择文件' },
            { title: '流水线进度' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {/* ========== Step 0: 选择空间与标签 ========== */}
        {currentStep === 0 && (
          <div>
            <Alert
              message="只需要选择知识空间和标签"
              description="文档类型、业务域、密级、生效日期、上传者、部门和文件信息会在选择文件后自动识别或按默认规则填充。"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                overwriteExisting: false,
              }}
            >
              <Form.Item label={<Space><DatabaseOutlined />知识空间</Space>} required>
                <Select
                  value={selectedSpace}
                  onChange={handleSpaceChange}
                  placeholder="请选择知识空间"
                  size="large"
                >
                  {spaces.map(space => (
                    <Select.Option key={space.id} value={space.id}>
                      {space.name} {space.id === 'DEFAULT' ? '(系统默认)' : ''}
                      {space.docCount !== undefined && ` - ${space.docCount} 文档`}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="labelTags" label={<Space><TagsOutlined />标签</Space>}>
                <Select mode="tags" placeholder="输入标签后回车添加，选择文件后还会自动补充标签" size="large" />
              </Form.Item>

              <Collapse
                style={{ marginBottom: 24 }}
                items={[
                  {
                    key: 'advanced',
                    label: <Space><SettingOutlined />高级选项</Space>,
                    children: (
                      <>
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
                          <Card size="small" style={{ background: 'var(--color-muted)', marginBottom: 16 }}>
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
                                style={{ width: 280 }}
                              >
                                <Select.Option value="SMART">智能切分 (SMART)</Select.Option>
                                <Select.Option value="SMART_LLM">智能切分 + LLM增强 (SMART_LLM)</Select.Option>
                                <Select.Option value="HEAD_FIRST">固定长度 - 从前到后</Select.Option>
                                <Select.Option value="TAIL_FIRST">固定长度 - 从后到前</Select.Option>
                                <Select.Option value="UNIFORM">固定长度 - 均匀切分</Select.Option>
                              </Select>
                            </Form.Item>
                          </Card>
                        )}

                        <Form.Item name="overwriteExisting" label="覆盖重名文档" valuePropName="checked">
                          <Switch
                            checkedChildren="开"
                            unCheckedChildren="关"
                            onChange={(checked) => setOverwriteExisting(checked)}
                          />
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            开启后，如存在同名文档将自动覆盖
                          </Text>
                        </Form.Item>
                      </>
                    ),
                  },
                ]}
              />

              <Alert
                message="权限将默认设置为仅上传者可写，空间权限和文档权限后续可在文档管理页调整。"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item>
                <Button type="primary" size="large" block onClick={handleMetadataConfirm}>
                  进入文件选择
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
              description="支持格式：PDF / Word / PPT / Excel / TXT / MD，单个文件 <= 50MB。选择文件后会自动识别文档类型、业务域、密级和标签。"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            <Dragger {...uploadProps} style={{ padding: '32px 0', borderRadius: 8 }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 48, color: 'var(--color-accent)' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                支持单个文件上传，请确保文件内容为文字型文档（非扫描件）
              </p>
            </Dragger>

            {fileList.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Descriptions title="自动识别结果" column={2} bordered size="small">
                  <Descriptions.Item label="文件名">{fileList[0].name}</Descriptions.Item>
                  <Descriptions.Item label="文件大小">
                    {(fileList[0].size! / 1024).toFixed(1)} KB
                  </Descriptions.Item>
                  <Descriptions.Item label="文档类型">
                    {DOC_TYPE_LABELS[formValues.docType as DocType] || formValues.docType || DOC_TYPE_LABELS.REGULATION}
                  </Descriptions.Item>
                  <Descriptions.Item label="业务域">
                    {BIZ_DOMAIN_LABELS[formValues.bizDomain as string] || formValues.bizDomain || BIZ_DOMAIN_LABELS.COMPLIANCE}
                  </Descriptions.Item>
                  <Descriptions.Item label="密级">
                    {SEC_LEVEL_LABELS[formValues.secLevel as SecLevel] || SEC_LEVEL_LABELS[1]}
                  </Descriptions.Item>
                  <Descriptions.Item label="知识空间">
                    {spaces.find(space => space.id === selectedSpace)?.name || selectedSpace}
                  </Descriptions.Item>
                  <Descriptions.Item label="标签" span={2}>
                    <Space size={[4, 4]} wrap>
                      {Array.isArray(formValues.labelTags) && formValues.labelTags.length > 0
                        ? formValues.labelTags.map((tag: string) => <Tag key={tag}>{tag}</Tag>)
                        : <Text type="secondary">无标签</Text>}
                    </Space>
                  </Descriptions.Item>
                </Descriptions>

                <Button
                  type="primary"
                  size="large"
                  block
                  style={{ marginTop: 24 }}
                  onClick={handleUploadTrigger}
                  icon={<InboxOutlined />}
                  loading={isProcessing}
                >
                  {isProcessing ? '上传中...' : '触发入库流水线'}
                </Button>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Button onClick={() => setCurrentStep(0)}>返回调整空间和标签</Button>
            </div>
          </div>
        )}

        {/* ========== Step 2: 流水线进度 ========== */}
        {currentStep === 2 && (
          <div>
            <Alert
              message="流水线处理中"
              description={
                isProcessing
                  ? '系统正在执行：解析 → 清洗 → 切片 → 向量化入库，预计耗时 2-5 分钟...'
                  : '入库流程已完成，文档已进入可检索状态'
              }
              type={isProcessing ? 'info' : 'success'}
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Card
              title="文档入库流水线"
              style={{ marginBottom: 24, background: 'var(--color-muted)' }}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {uploadProgress.map((step, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{
                      background: step.status === 'process' ? 'rgba(37, 99, 235, 0.06)' : 'var(--color-muted)',
                      border: step.status === 'process' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
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
                            {step.timestamp}
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
                                      borderLeft: sub.status === 'process' ? '2px solid var(--color-accent)' : '2px solid transparent',
                                      paddingLeft: sub.status === 'process' ? 12 : 14,
                                    }}
                                  >
                                    {sub.status === 'finish' && (
                                      <CheckCircleFilled style={{ color: 'var(--color-success)', marginRight: 8, fontSize: 12 }} />
                                    )}
                                    {sub.status === 'process' && (
                                      <LoadingOutlined style={{ color: 'var(--color-accent)', marginRight: 8, fontSize: 12 }} />
                                    )}
                                    {sub.status === 'wait' && (
                                      <div style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        border: '1px solid var(--color-border)',
                                        marginRight: 8,
                                      }} />
                                    )}
                                    <Text style={{ fontSize: 13, color: sub.status === 'process' ? 'var(--color-accent)' : undefined }}>
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
              <Card title="入库结果" style={{ background: 'rgba(22, 163, 74, 0.06)', border: '1px solid var(--color-success)' }}>
                <Descriptions column={2}>
                  <Descriptions.Item label="文档ID">
                    <Text code copyable>{docId}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="版本号">v{version}</Descriptions.Item>
                  <Descriptions.Item label="文件名">
                    {fileList[0]?.name || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="文件大小">
                    {fileList[0]?.size != null ? `${(fileList[0].size / 1024).toFixed(1)} KB` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="处理耗时">
                    {elapsedSeconds != null ? `${elapsedSeconds} 秒` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="文档类型">
                    {DOC_TYPE_LABELS[formValues.docType as DocType] || formValues.docType || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="业务域">
                    {BIZ_DOMAIN_LABELS[formValues.bizDomain as string] || formValues.bizDomain || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="文档密级">
                    {SEC_LEVEL_LABELS[formValues.secLevel as SecLevel] || '公开'}
                  </Descriptions.Item>
                  <Descriptions.Item label="知识空间">
                    {spaces.find(space => space.id === selectedSpace)?.name || selectedSpace}
                  </Descriptions.Item>
                  <Descriptions.Item label="标签" span={2}>
                    <Space size={[4, 4]} wrap>
                      {Array.isArray(formValues.labelTags) && formValues.labelTags.length > 0
                        ? formValues.labelTags.map((tag: string) => <Tag key={tag}>{tag}</Tag>)
                        : <Text type="secondary">无标签</Text>}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="切片规则">
                    段长 {chunkConfig.chunkSize}，重叠 {chunkConfig.overlapRatio}%
                  </Descriptions.Item>
                  <Descriptions.Item label="向量模型">
                    {EMBEDDING_MODEL}（{EMBEDDING_DIM} 维）
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color="success" icon={<CheckCircleFilled />}>
                      READY — 可被检索
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="可检索时间">
                    <Text type="success">
                      {elapsedSeconds != null
                        ? `约 ${Math.ceil(elapsedSeconds / 60)} 分钟内`
                        : '待确认'}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>

                <Divider />

                <Space>
                  <Button type="primary" onClick={() => router.push(`/documents/${docId}`)}>
                    查看文档详情
                  </Button>
                  <Button onClick={() => {
                    setCurrentStep(0);
                    setFileList([]);
                    setUploadProgress([...MOCK_PIPELINE_STEPS]);
                    setIsProcessing(false);
                    setElapsedSeconds(null);
                  }}>
                    继续上传
                  </Button>
                  <Button onClick={() => router.push('/rag')}>
                    进入知识问答
                  </Button>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Button onClick={() => setCurrentStep(1)}>返回上传</Button>
            </div>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
