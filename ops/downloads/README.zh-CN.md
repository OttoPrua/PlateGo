# PlateGo 静态下载站

此目录提供 `https://platego.ukusik.cc/` 的静态分发配置。应用只监听主机 `127.0.0.1:18801`，公网 HTTPS 由现有 Caddy 代理。不新增数据库、Redis、公共号码池或浏览器远程执行服务。

## 生成冻结部署包

在源码根目录完成扩展构建、MV3 校验和安装包打包后，运行：

```sh
node scripts/package-site.mjs
```

本地打包检查：`node --test scripts/package-site.test.mjs`。Docker 可用时，`PLATEGO_DOCKER_SMOKE=1 node --test scripts/package-site.test.mjs` 会在独立临时项目和随机本机端口验证容器、下载、ETag/304、gzip 与只读挂载，结束后仅清理该测试项目。

输入是已构建的 `apps/extension/dist` 与 `dist/releases/PlateGo-Chrome-v<版本>.zip`。脚本核验 ZIP CRC、文件白名单、包内扩展与当前构建的一致性；仅复制指定配置、安装包和生成页面。不会复制源码目录、`private/`、`services/`、原始号池、合格证、截图、环境文件或依赖目录。

输出为 `dist/deployment/<artifact-id>/`、同名 `.tar.gz` 和 `.tar.gz.sha256`。其中 `deployment.json` 记录版本、源码提交与工作区是否有改动、构建/ZIP 哈希、固定镜像来源；`SHA256SUMS` 覆盖部署文件。工作区有改动时不会声称产物等于已提交源码。只有 `site/` 会被 Web 服务公开。

冻结目录：`{{ARTIFACT_ID}}`；扩展版本：`{{VERSION}}`。本源码文档中的占位符会在打包时替换。

## 服务器部署

把 `.tar.gz` 与其 `.sha256` 传到服务器同一临时目录，先核对外层校验，再解压到唯一发布目录。以下命令中的文件名使用生成结果：

```sh
sha256sum -c {{ARTIFACT_ID}}.tar.gz.sha256
sudo install -d -m 755 /opt/platego/releases
sudo tar --no-same-owner -xzf {{ARTIFACT_ID}}.tar.gz -C /opt/platego/releases
cd /opt/platego/releases/{{ARTIFACT_ID}}
sha256sum -c SHA256SUMS
docker compose -p platego config --quiet
docker compose -p platego pull
docker compose -p platego up -d --wait
curl -fsS http://127.0.0.1:18801/healthz
```

部署目录必须可被容器 UID 101 读取，且部署后保持原样；不要覆盖同版本安装包。配置使用只读绑定挂载和只读根文件系统，只有 16 MiB `/tmp` 临时空间可写。默认最多 0.5 CPU、64 MiB 内存和 32 个进程，错误日志限额 4 MiB，不记录 Nginx 访问日志。主机反向代理的日志沿用其现有配置。

`HOST_BIND_PORT` 是唯一可选环境项，默认 18801。如需避让端口，可复制 `.env.example` 为 `.env` 后改为已确认空闲的本机端口，并同步改 Caddy 上游。禁止改为公网地址或占用 80/443。无需任何密钥，也无需挂载 Docker socket。

由现有 Caddy 管理者把下面的站点块合并到当前配置，保留已有 Timeline 等站点；验证配置通过后仅 reload Caddy：

```caddyfile
platego.ukusik.cc {
    reverse_proxy 127.0.0.1:18801
}
```

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS https://platego.ukusik.cc/healthz
curl -fsS https://platego.ukusik.cc/latest.json
```

## 回读与缓存验收

公开路径仅包含首页、`/healthz`、`/latest.json`、`/downloads/PlateGo-Chrome-v{{VERSION}}.zip` 和 `/downloads/SHA256SUMS-v{{VERSION}}.txt`。`latest.json` 只有 `version`、`path`、`sha256`、`size` 四个描述字段，没有可执行配置。下载 ZIP 后按校验文件再次核对 SHA-256；用 `unzip -t` 检查完整性，并确认首页的下载链接、版本与哈希一致。

```sh
curl -fsSI https://platego.ukusik.cc/
curl -fsSI https://platego.ukusik.cc/latest.json
curl -fsSI https://platego.ukusik.cc/downloads/PlateGo-Chrome-v{{VERSION}}.zip
curl -fsSI -H 'Accept-Encoding: gzip' https://platego.ukusik.cc/
```

首页和版本描述应为 `Cache-Control: no-cache`；版本化 ZIP/校验文件为 `public, max-age=31536000, immutable`。响应带 ETag，再发同一路径且 `If-None-Match` 等于它时应得到 304。HTML、文本、JSON 可 gzip；ZIP 不二次压缩。未知路径（含 `/v1/pools`）为 404，本部署没有认证 API 或其缓存。

## 更新与回滚

每个版本先在新目录完整校验，记录当前正常运行的发布目录，再在新目录执行 `docker compose -p platego up -d --wait`。同一 Compose 项目只替换下载站容器；不先执行 `down`，也不操作其他项目、卷或 Docker 守护进程。

若新版本健康检查或公网下载回读失败，进入记录的上一发布目录，执行同样的 `docker compose -p platego up -d --wait`，重新核对健康、版本与下载哈希。端口不变时无需修改 Caddy。保留上一份目录和镜像供回滚，不在此流程中清理旧版本。静态站没有数据库迁移或用户数据写入。

## 镜像来源

使用 [NGINX 官方维护的非 root 镜像](https://github.com/nginx/docker-nginx-unprivileged)，版本和 OCI 索引 SHA-256 均固定；具体来源及核验时间见 `image-lock.json`。镜像升级时必须重新核验 registry digest 并复跑容器校验，不能只改标签。配置直接启动 Nginx，不运行需要改写 `/etc` 的入口脚本。
