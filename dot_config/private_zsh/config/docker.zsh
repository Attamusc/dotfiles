alias dc=docker-compose
alias dcl="docker-compose logs"
alias dclf="docker-compose logs -f --tail=10"

docker-clean() {
  docker rm $(docker ps -a -q)
  docker rmi $(docker images | grep "^<none>" | awk '{print $3}')
}

de() {
  docker exec -it $1 /bin/bash
}
