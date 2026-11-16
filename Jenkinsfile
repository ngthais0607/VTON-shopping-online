// CI for TrueLook: mirrors the backend + frontend jobs in .github/workflows/ci.yml.
// Runs on the controller image built from docker/jenkins/Dockerfile.
// MariaDB integration tests and the Compose smoke test are not included yet.
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
                uv venv --seed --python 3.12 .venv-ci
                . .venv-ci/bin/activate
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
  }

  post {
    always { cleanWs() }
  }
}
