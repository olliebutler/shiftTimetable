package com.ollie;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class DatabaseLoader implements CommandLineRunner {

	private final ShiftRepo repository;

	@Autowired
	public DatabaseLoader(ShiftRepo repository) {
		this.repository = repository;
	}

	@Override
	public void run(String... strings) throws Exception {
		this.repository.save(new Shift("1/2/17", "Afternoon"));
	}
}