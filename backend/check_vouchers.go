package main

import (
	"fmt"
	"urbanmenphoto/backend/app/store"
)

func main() {
	s, err := store.NewJSONStore("data")
	if err != nil {
		panic(err)
	}

	vouchers := s.ListVouchers()
	fmt.Printf("Found %d vouchers\n", len(vouchers))
	for _, v := range vouchers {
		fmt.Printf("- %s (Limit: %d, Used: %d)\n", v.Code, v.UsageLimit, v.UsedCount)
		v.UsageLimit = 9999
		s.UpsertVoucher(v)
	}
	fmt.Println("Done updating vouchers.")
}
