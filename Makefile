.PHONY: build run dev clean deps docker generate

BIN := bin/pg-storage-visualizer
CMD := ./cmd/pg-storage-visualizer

build: generate
	go build -o $(BIN) $(CMD)

run: build
	$(BIN)

generate:
	@which templ > /dev/null || go install github.com/a-h/templ/cmd/templ@latest
	templ generate

clean:
	rm -rf bin/

deps:
	go mod tidy

docker:
	docker build -t pg-storage-visualizer .
