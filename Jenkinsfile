// CI for TrueLook: mirrors the backend + frontend jobs in .github/workflows/ci.yml.
// Runs on the controller image built from docker/jenkins/Dockerfile.
// The Compose smoke test is not included yet.
pipeline {
  agent any

  options {
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds(abortPrevious: true)
    timestamps()
  }

  stages {
    stage('Checks') {
      parallel {
        stage('Backend') {
          environment {
            REDIS_URL = 'memory://'
            EMAILS_ENABLED = 'false'
          }
          steps {
            dir('backend') {
              sh '''
                set -e
                # Must be named .venv: tests/test_architecture.py skips only that name.
                uv venv --seed --python 3.12 .venv
                . .venv/bin/activate
                pip install --require-hashes -r requirements-dev-lock.txt
                pip check
                ruff check app tests
                ruff format --check app tests
                python -m pytest tests --ignore=tests/integration -q
              '''
            }
          }
        }

        stage('Frontend') {
          steps {
            dir('frontend') {
              sh '''
                set -e
                corepack prepare pnpm@10.33.4 --activate
                pnpm install --frozen-lockfile
                pnpm exec tsc --noEmit
                pnpm test
                pnpm exec eslint . --max-warnings=0
                pnpm build
              '''
            }
          }
        }
      }
    }

    stage('MariaDB integration') {
      steps {
        dir('backend') {
          // Throwaway MariaDB container + network, removed on exit. Never touches the
          // truelook compose project or its volumes.
          sh '''
            set -eu
            NAME="tlci-mariadb-$$"
            NET="tlci-net-$$"
            cleanup() {
              docker rm -f "$NAME" >/dev/null 2>&1 || true
              docker network disconnect "$NET" "$(hostname)" >/dev/null 2>&1 || true
              docker network rm "$NET" >/dev/null 2>&1 || true
            }
            trap cleanup EXIT

            docker network create "$NET"
            docker run -d --name "$NAME" --network "$NET" --network-alias db               -e MARIADB_ROOT_PASSWORD=password123               -e MARIADB_DATABASE=fastapi_founder_test               mariadb:11.2
            docker network connect "$NET" "$(hostname)"

            # Ping over TCP (127.0.0.1): the image's temporary init server answers on the
            # unix socket but has networking disabled, so a socket ping succeeds too early.
            for i in $(seq 1 30); do
              if docker exec "$NAME" mariadb-admin ping -h 127.0.0.1 --protocol=tcp -uroot -ppassword123 >/dev/null 2>&1; then
                break
              fi
              if [ "$i" = 30 ]; then echo "MariaDB did not become ready"; exit 1; fi
              sleep 2
            done

            . .venv/bin/activate
            export PYTHONPATH=.
            export DATABASE_URL="mysql+pymysql://root:password123@db:3306/fastapi_founder_test"
            export TEST_DATABASE_URL="$DATABASE_URL"
            export REDIS_URL=memory:// EMAILS_ENABLED=false
            export SECRET_KEY=ci-test-secret-key-32-characters-minimum
            export VIETQR_BANK_ID=MB VIETQR_ACCOUNT_NO=0000000000 VIETQR_ACCOUNT_NAME=TRUELOOK
            export VIETQR_WEBHOOK_SECRET=ci-test-webhook-secret-32-chars-min
            export MINIO_ACCESS_KEY=ci-test-minio-access-key MINIO_SECRET_KEY=ci-test-minio-secret-key

            python -m alembic upgrade head
            python -m alembic downgrade base
            python -m alembic upgrade head
            python -m pytest tests/integration -q
          '''
        }
      }
    }
  }

  post {
    always { cleanWs() }
  }
}
