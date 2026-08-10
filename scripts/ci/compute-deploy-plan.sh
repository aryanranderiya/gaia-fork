#!/usr/bin/env bash
# Computes build.yml's deployment plan: which production deploy workflows
# should run, and whether any image lane published to GHCR without a
# corresponding deploy running (a "publish without deploy" drift risk).
#
# Consumed by the `deployment-plan` job, which runs with `if: always()` so a
# failed/cancelled lane (docker-release, docker-web, docker-grafana) never
# skips planning outright -- each lane's result is evaluated explicitly here
# instead of relying on implicit all-success gating. A failed docker-web must
# never block a ready backend deploy, and vice versa.
#
# Writes backend_deploy / frontend_deploy / backend_orphaned /
# frontend_orphaned to $GITHUB_OUTPUT. trigger-deploy and trigger-web consume
# only backend_deploy / frontend_deploy -- keep those two names and their
# 'true'/'false' string contract stable.
set -euo pipefail

: "${REF:?REF is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"
: "${API_AFFECTED:=false}"
: "${BOTS_AFFECTED:=false}"
# Job .result values: success | failure | cancelled | skipped.
: "${DOCKER_RELEASE_RESULT:?DOCKER_RELEASE_RESULT is required}"
: "${DOCKER_WEB_RESULT:?DOCKER_WEB_RESULT is required}"
# Set by docker-release right after its push steps, independent of later
# steps in that job (e.g. Discord command sync) that can fail afterwards and
# flip the job's overall result to 'failure' even though images already
# landed in GHCR. Empty/anything other than 'true' is treated as "no proof
# of publish" -- never claim a publish happened without evidence.
: "${BACKEND_IMAGES_PUBLISHED:=false}"
: "${MANUAL_MODE_INPUT:=}"
: "${MANUAL_MODE_EVENT:=}"

backend_deploy=false
frontend_deploy=false
manual_mode="${MANUAL_MODE_INPUT:-}"
if [ -z "$manual_mode" ]; then
  manual_mode="${MANUAL_MODE_EVENT:-}"
fi
if [ -z "$manual_mode" ]; then
  manual_mode="auto"
fi

on_master=false
[ "$REF" = "refs/heads/master" ] && on_master=true

if [ "$on_master" = "false" ]; then
  echo "Not on master; deploy jobs disabled."
elif [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  # Manual overrides are an explicit operator decision -- they intentionally
  # bypass affected-detection AND lane-result gating. This is the documented
  # self-heal remedy for drift: `deployment_mode=both` (or backend-only /
  # frontend-only) redeploys whatever is currently tagged :latest in GHCR,
  # regardless of what this run's affected-detection or build lanes decided.
  case "$manual_mode" in
    auto)
      if [ "$API_AFFECTED" = "true" ] || [ "$BOTS_AFFECTED" = "true" ]; then
        if [ "$DOCKER_RELEASE_RESULT" = "success" ]; then
          backend_deploy=true
        fi
      fi
      # Frontend sync to the Vercel source repo builds from source, not from
      # docker-web's image, so it is not gated on docker-web's result.
      frontend_deploy=true
      ;;
    backend-only)
      backend_deploy=true
      ;;
    frontend-only)
      frontend_deploy=true
      ;;
    both)
      backend_deploy=true
      frontend_deploy=true
      ;;
    none)
      ;;
    *)
      echo "::error::Invalid deployment_mode '$manual_mode'. Use auto, backend-only, frontend-only, both, or none."
      exit 1
      ;;
  esac
else
  # Automatic push-triggered plan: a failed/cancelled docker-release means no
  # verified new backend image for this run, so never deploy on a guess.
  if [ "$API_AFFECTED" = "true" ] || [ "$BOTS_AFFECTED" = "true" ]; then
    if [ "$DOCKER_RELEASE_RESULT" = "success" ]; then
      backend_deploy=true
    fi
  fi
  frontend_deploy=true
fi

# Orphan detection: images landed in GHCR tagged :latest but the deploy that
# would roll them out did not run this time, for ANY reason (lane failure,
# cancellation, or the plan above simply deciding not to deploy). Scoped to
# master: off-master manual builds intentionally never deploy and must not be
# reported as drift.
backend_orphaned=false
frontend_orphaned=false
if [ "$on_master" = "true" ]; then
  if [ "$BACKEND_IMAGES_PUBLISHED" = "true" ] && [ "$backend_deploy" != "true" ]; then
    backend_orphaned=true
  fi
  if [ "$DOCKER_WEB_RESULT" = "success" ] && [ "$frontend_deploy" != "true" ]; then
    frontend_orphaned=true
  fi
fi

{
  echo "backend_deploy=$backend_deploy"
  echo "frontend_deploy=$frontend_deploy"
  echo "backend_orphaned=$backend_orphaned"
  echo "frontend_orphaned=$frontend_orphaned"
  echo "docker_release_result=$DOCKER_RELEASE_RESULT"
  echo "docker_web_result=$DOCKER_WEB_RESULT"
} >> "$GITHUB_OUTPUT"

echo "Deploy plan => backend: $backend_deploy, frontend: $frontend_deploy"
echo "Orphan check => backend_orphaned: $backend_orphaned, frontend_orphaned: $frontend_orphaned"
echo "  docker-release result: $DOCKER_RELEASE_RESULT (images_published=$BACKEND_IMAGES_PUBLISHED), docker-web result: $DOCKER_WEB_RESULT"
