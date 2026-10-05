# Infra

Docker, Nginx 및 Cafe24 운영 배포 설정을 관리합니다.

프론트엔드 운영 컨테이너 설정은 저장소 루트의 `compose.yml`, 배포 절차는 `scripts/deploy.sh`를 사용합니다.

현재 운영 기준:

- Image: `newrox/roxstock-frontend:<tag>`
- Container: `roxstock-frontend`
- Port: `80:80`
- Restart: `unless-stopped`
- Memory: `96MiB`
