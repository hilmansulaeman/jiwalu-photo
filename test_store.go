package main

import (
	"fmt"
	"urbanmenphoto/backend/app/models"
	"urbanmenphoto/backend/app/store"
)

func main() {
	s, err := store.NewJSONStore("data/db.json")
	if err != nil {
		fmt.Println("Init Error:", err)
		return
	}
	frame := models.Frame{
		ID: "test-frame-1",
		Name: "Test Frame",
		ImageURL: "data:image/gif...",
	}
	err = s.UpsertFrame(frame)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		fmt.Println("Success!")
	}
	frames := s.ListFrames()
	fmt.Printf("Total frames: %d\n", len(frames))
}
