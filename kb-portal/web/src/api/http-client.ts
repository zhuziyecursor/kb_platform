import axios from 'axios';

const httpClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080',
  timeout: 10000,
});

// 请求拦截：注入 OBO token，禁止注入自定义用户头
httpClient.interceptors.request.use((config) => {
  // In real app, we'll get this from sessionStorage
  // const oboToken = sessionStorage.getItem('obo_token');
  // if (oboToken) config.headers['Authorization'] = `Bearer ${oboToken}`;

  // 确保没有自定义用户头，遵循网关要求
  ['x-user-id', 'x-tenant-id', 'x-roles', 'x-dept-id'].forEach(h => delete config.headers[h]);
  return config;
});

export default httpClient;
